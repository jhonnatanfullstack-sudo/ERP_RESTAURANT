import { HttpError } from '../../utils/http-error';
import { logger } from '../../utils/logger';
import {
  empresaIdActual,
  confirmarTransaccionDeLaPeticion,
  ejecutarEnTransaccionPropia,
  contextoActual,
} from '../../database/tenant-context';
import { cifrar, descifrar, descifrarTexto } from '../../utils/cifrado';
import {
  resolverTasaIgv,
  TASA_IGV_GENERAL,
  TASA_IGV_MYPE_RESTAURANTES,
} from '../empresa/igv.service';
import { ventaRepository } from '../ventas/venta.repository';
import { EstadoVenta, FormaPago, type Venta } from '../ventas/venta.entity';
import { cuotaVentaRepository } from '../cobranzas/cobranza.repository';
import { calcularMontoPendienteCredito } from '../cobranzas/cobranza.service';
import { CODIGO_FACTURA } from '../catalogos/codigos-sunat';
import {
  construirXmlFactura,
  nombreArchivo,
  xmlTienePaymentTermsValido,
  type CuotaComprobante,
  type DatosClienteFiscal,
  type DatosEmpresaFiscal,
} from './ubl/factura.builder';
import { firmarXml } from './firma/firmador';
import { cargarPkcs12DesdeBuffer } from './firma/certificado';
import { NubefactOseProvider } from './ose/nubefact-ose.provider';
import {
  comprobanteElectronicoRepository,
  configuracionFacturacionRepository,
} from './facturacion.repository';
import { ComprobanteElectronico, EstadoComprobante } from './comprobante-electronico.entity';
import {
  AmbienteFacturacion,
  ConfiguracionFacturacion,
  ProveedorOse,
} from './configuracion-facturacion.entity';
import type { CredencialesOse, OseProvider, ResultadoOse } from './ose/ose-provider.interface';
import type { GuardarConfiguracionFacturacionDto } from './facturacion.dto';

/** Relaciones que necesita `construirXmlFactura` y que `venta.service.ts` no carga completas
 * (le falta `producto.unidadMedida`, que el XML sí exige) — este módulo trae su propia
 * consulta en vez de reusar `obtenerVenta`. */
const RELACIONES_VENTA_FACTURACION = {
  empresa: true,
  cliente: { tipoDocumentoIdentidad: true },
  tipoComprobante: true,
  tipoOperacion: true,
  detalles: { producto: { unidadMedida: true }, tipoAfectacionIgv: true },
} as const;

/** Proveedores OSE disponibles, por código — el único punto a tocar si se suma un segundo. */
const PROVEEDORES_OSE: Record<ProveedorOse, OseProvider> = {
  [ProveedorOse.NUBEFACT]: new NubefactOseProvider(),
};

// --- Configuración (certificado + credenciales del OSE) ------------------------------------

export interface ConfiguracionFacturacionResuelta {
  oseProveedor: ProveedorOse | null;
  oseUsuario: string | null;
  tieneCredencialOse: boolean;
  tieneCertificado: boolean;
  certificadoValidoHasta: string | null;
  ambiente: AmbienteFacturacion;
  activo: boolean;
}

function aResuelta(config: ConfiguracionFacturacion | null): ConfiguracionFacturacionResuelta {
  return {
    oseProveedor: config?.oseProveedor ?? null,
    oseUsuario: config?.oseUsuario ?? null,
    tieneCredencialOse: !!config?.oseCredencialCifrada,
    tieneCertificado: !!config?.certificadoPfxCifrado,
    certificadoValidoHasta: config?.certificadoValidoHasta ?? null,
    ambiente: config?.ambiente ?? AmbienteFacturacion.BETA,
    activo: config?.activo ?? false,
  };
}

async function configuracionDeLaEmpresa(): Promise<ConfiguracionFacturacion | null> {
  return configuracionFacturacionRepository.findOneBy({ empresa: { id: empresaIdActual() } });
}

export async function obtenerConfiguracionFacturacion(): Promise<ConfiguracionFacturacionResuelta> {
  return aResuelta(await configuracionDeLaEmpresa());
}

export async function guardarConfiguracionFacturacion(
  dto: GuardarConfiguracionFacturacionDto,
): Promise<ConfiguracionFacturacionResuelta> {
  const existente = await configuracionDeLaEmpresa();

  const cambios: Partial<ConfiguracionFacturacion> = {
    oseProveedor: dto.oseProveedor,
    oseUsuario: dto.oseUsuario,
    ambiente: dto.ambiente,
    activo: dto.activo,
  };
  if (dto.oseClave) {
    cambios.oseCredencialCifrada = cifrar(dto.oseClave);
  }

  const config = existente
    ? configuracionFacturacionRepository.merge(existente, cambios)
    : configuracionFacturacionRepository.create(cambios);

  return aResuelta(await configuracionFacturacionRepository.save(config));
}

/**
 * Guarda el certificado `.pfx`/`.p12` cifrado, tras comprobar que la contraseña realmente lo
 * abre — mejor fallar acá con un mensaje claro que recién al intentar firmar una venta real.
 */
export async function guardarCertificadoFacturacion(
  archivo: Buffer,
  contrasena: string,
): Promise<ConfiguracionFacturacionResuelta> {
  let validoHasta: Date;
  try {
    validoHasta = cargarPkcs12DesdeBuffer(archivo, contrasena).validoHasta;
  } catch {
    throw new HttpError(400, 'No se pudo leer el certificado: verifica el archivo y la contraseña');
  }

  const existente = await configuracionDeLaEmpresa();
  const cambios: Partial<ConfiguracionFacturacion> = {
    certificadoPfxCifrado: cifrar(archivo),
    certificadoContrasenaCifrada: cifrar(contrasena),
    certificadoValidoHasta: validoHasta.toISOString().slice(0, 10),
  };
  const config = existente
    ? configuracionFacturacionRepository.merge(existente, cambios)
    : configuracionFacturacionRepository.create(cambios);

  return aResuelta(await configuracionFacturacionRepository.save(config));
}

// --- Emisión — PREPARAR → COMMIT ANTICIPADO → OSE → FINALIZAR (H13) ------------------------
//
// Antes de este rediseño, `emitirComprobante()`/`reintentarEnvio()` armaban el XML, lo
// guardaban y llamaban al OSE real dentro de la misma transacción HTTP de la petición —que
// solo confirma al final, después de enviar la respuesta (`tenant.middleware.ts`). Si el
// commit de esa transacción fallaba DESPUÉS de que el OSE ya había aceptado el documento, el
// resultado era un comprobante fiscal real, firmado y aceptado por SUNAT, sin ningún rastro
// local recuperable (H13).
//
// El flujo nuevo separa el trabajo en tres fases con una única regla: **el OSE jamás se llama
// antes de que el estado local previo (PENDIENTE→ENVIANDO) sea durable**.
//
//   PREPARAR   → dentro de la TX HTTP normal (la misma que abre `tenant.middleware.ts`, sin
//                ninguna conexión nueva): bloquea Venta, bloquea Comprobante (orden Venta →
//                Comprobante, siempre), valida, genera/reutiliza el XML, incrementa
//                `intentos`, deja el comprobante en `ENVIANDO`.
//   COMMIT      → `confirmarTransaccionDeLaPeticion()` confirma esa MISMA transacción HTTP
//   ANTICIPADO    de inmediato (no espera a que termine la petición) y libera la conexión.
//                Si falla, lanza — el código de abajo nunca llega a invocar al OSE.
//   OSE         → sin ninguna transacción de Postgres abierta durante la llamada de red.
//   FINALIZAR   → `ejecutarEnTransaccionPropia`, una conexión nueva y corta: aplica el
//                resultado con compare-and-swap (`WHERE estado='enviando' AND
//                intentos=:numeroIntento`) — si no coincide, no sobrescribe nada y responde
//                500 (anomalía a reconciliar), nunca asume qué pasó.

function mapearEstado(codigoRespuesta: string): EstadoComprobante {
  if (codigoRespuesta === '0') return EstadoComprobante.ACEPTADO;
  if (codigoRespuesta.startsWith('4')) return EstadoComprobante.OBSERVADO;
  return EstadoComprobante.RECHAZADO;
}

function validarVentaFacturable(venta: Pick<Venta, 'estado'>): void {
  if (venta.estado === EstadoVenta.ANULADA) {
    throw new HttpError(409, 'No se puede emitir un comprobante para una venta anulada');
  }
}

/** Catálogo SUNAT N° 06 — mismo código que ya usan, cada uno con su propia constante local,
 * `venta.service.ts: resolverCliente` y `cliente.service.ts: esPersonaJuridica` (no existía
 * ningún punto central compartido; se mantiene el mismo patrón acá en vez de crear uno nuevo). */
const CODIGO_RUC = '6';

/**
 * H16D-03 (revisión Codex) — `snapshotFiscalVersion` solo puede ser `null` (legacy) o `1`
 * (contrato H16 completo); cualquier otro valor (`0`, `2`, `-1`, ...) es una anomalía de datos,
 * nunca un legacy implícito. Antes de esta corrección, `resolverDatosEmpresaFiscal`/
 * `resolverDatosClienteFiscal` solo comprobaban `=== 1` y trataban cualquier otra cosa como
 * legacy — incluyendo un valor desconocido, que habría caído en la relación viva sin ninguna
 * garantía ni aviso. Se llama antes que cualquier otro resolver de esta venta. La migración
 * agrega además un `CHECK` de Postgres con la misma regla (`CHK_ventas_snapshot_fiscal_version`)
 * — esta función no confía únicamente en él, por si la fila llegó por otra vía (una migración
 * futura, una corrección manual) que lo hubiera evitado.
 */
function validarVersionSnapshotFiscalConocida(venta: Pick<Venta, 'snapshotFiscalVersion'>): void {
  if (venta.snapshotFiscalVersion !== null && venta.snapshotFiscalVersion !== 1) {
    throw new HttpError(
      500,
      `Venta con snapshotFiscalVersion desconocida (${venta.snapshotFiscalVersion}): no es ` +
        'NULL (legacy) ni 1 (contrato H16). Requiere revisión manual antes de poder emitirla.',
    );
  }
}

/**
 * H16 — datos fiscales efectivos de Empresa para el XML de la PRIMERA emisión, resueltos acá
 * (no en `factura.builder.ts`, que nunca decide snapshot-vs-vivo por sí mismo — ver el
 * docstring de `DatosEmpresaFiscal` ahí). Asume que `validarVersionSnapshotFiscalConocida` ya
 * corrió antes (H16D-03) — por eso solo distingue `=== 1` de "lo demás" (legacy), sin
 * necesidad de repetir esa validación acá.
 *
 * - `venta.snapshotFiscalVersion === 1` (venta creada bajo el contrato H16, ver
 *   `venta.service.ts: crearVenta`): usa EXCLUSIVAMENTE las columnas `snapshotEmpresa*` —
 *   nunca la relación viva `venta.empresa`. Editar `Empresa` después de esta venta no puede
 *   cambiar su XML. Fail-closed: si falta `snapshotEmpresaRuc` o `snapshotEmpresaRazonSocial`
 *   (los dos únicos campos obligatorios en `Empresa` misma — el resto son legítimamente
 *   opcionales, igual que en la entidad real), lanza ANTES de construir el XML, firmar o
 *   llamar al OSE — nunca cae en silencio a datos vivos como respaldo.
 * - `venta.snapshotFiscalVersion == null` ("legacy", venta creada antes de esta migración):
 *   compatibilidad best-effort con la relación viva `venta.empresa`, tal como funcionaba antes
 *   de H16 — **sin ninguna garantía histórica**: el dato real vigente al momento de esa venta
 *   ya no es reconstruible. Esta ruta nunca asigna `snapshotFiscalVersion = 1` ni modifica la
 *   fila para fingir que tiene snapshot propio.
 */
function resolverDatosEmpresaFiscal(venta: Venta): DatosEmpresaFiscal {
  if (venta.snapshotFiscalVersion === 1) {
    if (!venta.snapshotEmpresaRuc || !venta.snapshotEmpresaRazonSocial) {
      throw new HttpError(
        500,
        'Snapshot fiscal de Empresa incompleto para una venta con contrato H16 ' +
          '(snapshotFiscalVersion=1): faltan campos obligatorios. No se genera el comprobante ' +
          'usando datos vigentes como respaldo; requiere revisión manual de esta fila.',
      );
    }
    return {
      ruc: venta.snapshotEmpresaRuc,
      razonSocial: venta.snapshotEmpresaRazonSocial,
      nombreComercial: venta.snapshotEmpresaNombreComercial,
      ubigeo: venta.snapshotEmpresaUbigeo,
      direccionFiscal: venta.snapshotEmpresaDireccionFiscal,
    };
  }

  // Legacy — ver docstring de arriba.
  return {
    ruc: venta.empresa.ruc,
    razonSocial: venta.empresa.razonSocial,
    nombreComercial: venta.empresa.nombreComercial,
    ubigeo: venta.empresa.ubigeo,
    direccionFiscal: venta.empresa.direccionFiscal,
  };
}

/** Mismo criterio que `resolverDatosEmpresaFiscal`, para el receptor. Todos los campos de
 * Cliente son legítimamente opcionales (ver `DatosClienteFiscal`) — nunca se bloquea por esto,
 * ni siquiera con `snapshotFiscalVersion = 1`: una venta puede no tener cliente identificado.
 * La *coherencia* del snapshot (cuando sí hay cliente) se valida aparte, en
 * `validarSnapshotClienteCoherente` — ver H16D-02. */
function resolverDatosClienteFiscal(venta: Venta): DatosClienteFiscal {
  if (venta.snapshotFiscalVersion === 1) {
    return {
      tipoDocumentoCodigo: venta.snapshotClienteTipoDocumentoCodigo,
      numeroDocumento: venta.snapshotClienteNumeroDocumento,
      razonSocial: venta.snapshotClienteRazonSocial,
      nombres: venta.snapshotClienteNombres,
      apellidos: venta.snapshotClienteApellidos,
    };
  }

  // Legacy — ver docstring de `resolverDatosEmpresaFiscal`.
  if (!venta.cliente) return null;
  return {
    tipoDocumentoCodigo: venta.cliente.tipoDocumentoIdentidad?.codigo ?? null,
    numeroDocumento: venta.cliente.numeroDocumento,
    razonSocial: venta.cliente.razonSocial,
    nombres: venta.cliente.nombres,
    apellidos: venta.cliente.apellidos,
  };
}

/**
 * H16D-02 (revisión Codex) — valida que el snapshot de Cliente sea coherente cuando la venta
 * SÍ tenía un cliente real identificado. `venta.cliente` (la relación, cargada siempre por
 * `RELACIONES_VENTA_FACTURACION`) es el FK `cliente_id` de la propia `Venta` — inmutable desde
 * que se creó (no existe ningún flujo que reasigne el cliente de una venta ya creada), así que
 * "¿esta venta tenía un cliente real?" se responde con ese FK, no adivinando a partir de si las
 * columnas snapshot están en `null` (eso es justo lo que se quiere evitar: una factura/boleta
 * con cliente real cuyo snapshot se corrompió no debe degradarse en silencio a "CLIENTE
 * VARIOS" solo porque los campos quedaron vacíos).
 *
 * Solo aplica a `snapshotFiscalVersion === 1` con `venta.cliente !== null` — una venta legacy
 * sigue con su compatibilidad best-effort sin esta validación (nunca tuvo esta garantía), y una
 * venta sin cliente (consumidor final, boleta) sigue siendo válida sin cliente.
 *
 * Reglas, derivadas de las que YA exige `venta.service.ts: resolverCliente`/`cliente.service.ts`
 * al crear/editar un cliente — no inventadas:
 * - tipo y número de documento: ambos presentes o ambos ausentes (un cliente sin documento es
 *   legítimo para una boleta; "tipo sin número" o viceversa es un snapshot roto).
 * - debe existir al menos un nombre (`razonSocial` o `nombres`) — sin esto, el builder
 *   degradaría el receptor a "CLIENTE VARIOS" pese a que la venta sí tenía cliente.
 * - para FACTURA: el snapshot debe conservar RUC (tipo documento = '6') con número de
 *   documento — el mismo contrato que `resolverCliente` ya exige para poder crear la venta
 *   (esa función no exige `razonSocial` específicamente: un RUC de persona natural usa
 *   `nombres`, ya cubierto por la regla de nombre de arriba — no se inventa acá una exigencia
 *   más estricta que la que el dominio actual realmente tiene).
 *
 * Fail-closed: cualquier incumplimiento lanza ANTES de construir el XML, firmar, persistir o
 * llamar al OSE — nunca vuelve a consultar el Cliente vivo para "arreglar" un snapshot roto, y
 * nunca degrada a consumidor final.
 */
function validarSnapshotClienteCoherente(venta: Venta, clienteFiscal: DatosClienteFiscal): void {
  if (venta.snapshotFiscalVersion !== 1 || !venta.cliente) return;

  const tieneTipoDocumento = clienteFiscal?.tipoDocumentoCodigo != null;
  const tieneNumeroDocumento = clienteFiscal?.numeroDocumento != null;
  const tieneNombre = !!(clienteFiscal?.razonSocial || clienteFiscal?.nombres);

  if (tieneTipoDocumento !== tieneNumeroDocumento) {
    throw new HttpError(
      500,
      'Snapshot fiscal de Cliente incoherente para una venta con contrato H16 ' +
        '(snapshotFiscalVersion=1): el tipo y el número de documento no están ambos presentes ' +
        'ni ambos ausentes. No se genera el comprobante usando el Cliente vigente como ' +
        'respaldo; requiere revisión manual de esta fila.',
    );
  }
  if (!tieneNombre) {
    throw new HttpError(
      500,
      'Snapshot fiscal de Cliente incompleto para una venta con contrato H16 ' +
        '(snapshotFiscalVersion=1): esta venta tenía un cliente identificado, pero el ' +
        'snapshot no conserva ni razón social ni nombres. No se degrada a "CLIENTE VARIOS"; ' +
        'requiere revisión manual de esta fila.',
    );
  }
  if (
    venta.tipoComprobante.codigo === CODIGO_FACTURA &&
    (clienteFiscal?.tipoDocumentoCodigo !== CODIGO_RUC || !clienteFiscal.numeroDocumento)
  ) {
    throw new HttpError(
      500,
      'Snapshot fiscal de Cliente no cumple el contrato de FACTURA (RUC con número de ' +
        'documento) para una venta con contrato H16 (snapshotFiscalVersion=1). No se genera ' +
        'el comprobante usando el Cliente vigente como respaldo; requiere revisión manual de ' +
        'esta fila.',
    );
  }
}

/**
 * H16D-01 (revisión Codex) — tasa IGV histórica EFECTIVA para el `<cbc:Percent>` del XML de la
 * PRIMERA emisión. Mismo criterio de snapshot-vs-legacy que `resolverDatosEmpresaFiscal`.
 *
 * - `venta.snapshotFiscalVersion === 1`: usa EXCLUSIVAMENTE `venta.snapshotTasaIgv` — nunca
 *   `resolverTasaIgv()` (que resolvería contra `Empresa.acogidoRegimenMypeRestaurantes` VIVO,
 *   exactamente el problema que este snapshot existe para evitar: los importes de
 *   `DetalleVenta` ya están congelados a la tasa histórica, así que el `Percent` del XML tiene
 *   que coincidir con esos importes, no con el régimen actual de la Empresa). Fail-closed si
 *   es `null` o no es una de las dos tasas realmente soportadas hoy — nunca cae a
 *   `resolverTasaIgv()` como respaldo.
 * - legacy (`snapshotFiscalVersion == null`): compatibilidad best-effort con
 *   `resolverTasaIgv()`, tal como funcionaba antes de H16 — sin garantía histórica.
 */
async function resolverTasaIgvFiscal(venta: Venta): Promise<number> {
  if (venta.snapshotFiscalVersion === 1) {
    if (
      venta.snapshotTasaIgv === null ||
      (venta.snapshotTasaIgv !== TASA_IGV_GENERAL &&
        venta.snapshotTasaIgv !== TASA_IGV_MYPE_RESTAURANTES)
    ) {
      throw new HttpError(
        500,
        'Snapshot fiscal de tasa IGV ausente o inválido para una venta con contrato H16 ' +
          '(snapshotFiscalVersion=1). No se deriva la tasa desde la Empresa vigente como ' +
          'respaldo; requiere revisión manual de esta fila.',
      );
    }
    return venta.snapshotTasaIgv;
  }

  // Legacy — ver docstring de `resolverDatosEmpresaFiscal`.
  return resolverTasaIgv();
}

interface CredencialesYProveedor {
  oseProveedor: ProveedorOse;
  credenciales: CredencialesOse;
}

/**
 * Cronograma pactado (H15, RS 193-2020/SUNAT, Anexo IV) — únicamente para ventas al crédito, y
 * únicamente durante la emisión inicial: un reintento (`prepararReintento`) nunca llega a
 * llamar esta función, porque reutiliza el XML ya firmado tal cual, sin volver a construirlo
 * (H13-B). Se lee de `CuotaVenta` (el cronograma pactado), nunca de `PagoVenta` (la cobranza
 * real) — ver el docstring de `CuotaVenta`.
 *
 * Una venta al crédito sin ninguna cuota registrada no puede facturarse: el comprobante
 * quedaría incompleto frente a SUNAT. Se rechaza acá, antes de tocar el certificado, firmar o
 * llamar al OSE — nunca se inventa una cuota implícita (fecha, monto o Cuota001 de relleno).
 */
async function cargarCuotasPactadas(
  ventaId: string,
  formaPago: FormaPago,
): Promise<CuotaComprobante[]> {
  if (formaPago !== FormaPago.CREDITO) {
    return [];
  }

  const cuotas = await cuotaVentaRepository.find({
    where: { venta: { id: ventaId } },
    order: { numero: 'ASC' },
  });
  if (cuotas.length === 0) {
    throw new HttpError(
      409,
      'Esta venta es al crédito pero no tiene cuotas registradas: no se puede emitir el ' +
        'comprobante sin su cronograma de pago (RS 193-2020/SUNAT).',
    );
  }

  return cuotas.map((cuota) => ({
    numero: cuota.numero,
    monto: cuota.monto,
    fechaVencimiento: cuota.fechaVencimiento,
  }));
}

/** Valida que la facturación esté activada y que existan credenciales OSE — sin exigir el
 * certificado, que un reintento no necesita (no vuelve a firmar nada). */
async function credencialesOseFacturables(): Promise<CredencialesYProveedor> {
  const config = await configuracionDeLaEmpresa();
  if (!config || !config.activo) {
    throw new HttpError(
      409,
      'La facturación electrónica no está activada. Configúrala en Facturación electrónica.',
    );
  }
  if (!config.oseProveedor || !config.oseUsuario || !config.oseCredencialCifrada) {
    throw new HttpError(409, 'Falta configurar el usuario y la credencial del OSE');
  }
  return {
    oseProveedor: config.oseProveedor,
    credenciales: {
      usuario: config.oseUsuario,
      clave: descifrarTexto(config.oseCredencialCifrada),
      ambiente: config.ambiente,
    },
  };
}

interface PreparacionOse extends CredencialesYProveedor {
  comprobanteId: string;
  numeroIntento: number;
  xmlFirmado: string;
  nombreArchivoComprobante: string;
}

/**
 * PREPARAR de una emisión inicial. Solo procede si la venta NUNCA tuvo un comprobante
 * electrónico — cualquier comprobante existente, **incluyendo `ERROR_ENVIO`**, rechaza esta vía
 * (H13B-01, revisión Codex): una segunda llamada a `/emitir` no debe poder regenerar el XML, re
 * -firmar ni sobrescribir `xmlFirmado`/`hashFirma`/`nombreArchivo` de un intento anterior. El
 * único camino de reenvío para `ERROR_ENVIO` es `reintentarEnvio`/`prepararReintento`, que
 * reutiliza esos artefactos tal cual, sin volver a construir ni firmar nada. Corre dentro de la
 * transacción HTTP normal — ninguna conexión nueva todavía.
 */
async function prepararEmisionInicial(ventaId: string): Promise<PreparacionOse> {
  // Orden global de locks: Venta → Comprobante, siempre. Sin `relations`: Postgres rechaza
  // `FOR UPDATE` combinado con un `LEFT JOIN` ("cannot be applied to the nullable side of an
  // outer join") — mismo motivo documentado en `auth.service.ts: refrescarSesion` y
  // `talonario.service.ts: reservarNumero`.
  const ventaBloqueada = await ventaRepository.findOne({
    where: { id: ventaId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!ventaBloqueada) {
    throw new HttpError(404, 'Venta no encontrada');
  }
  validarVentaFacturable(ventaBloqueada);

  const existente = await comprobanteElectronicoRepository.findOne({
    where: { venta: { id: ventaId } },
    lock: { mode: 'pessimistic_write' },
  });
  if (existente) {
    // Cubre TODOS los estados por igual, sin ningún caso especial: ERROR_ENVIO incluido — un
    // comprobante en ERROR_ENVIO solo se reenvía vía `reintentarEnvio` (reutiliza el XML ya
    // firmado), nunca desde acá (que regeneraría XML/firma/hash — H13B-01).
    throw new HttpError(409, 'Esta venta ya tiene un comprobante electrónico emitido');
  }

  const cuotas = await cargarCuotasPactadas(ventaId, ventaBloqueada.formaPago);

  // Monto neto REALMENTE pendiente (H15C-01) — solo aplica al crédito y solo acá (emisión
  // inicial): un reintento nunca recalcula esto, reutiliza el XML ya firmado tal cual (H13-B).
  // `sum(cuotas)` es el cronograma pactado; `calcularMontoPendienteCredito` (cobranza.service.ts,
  // la fuente autoritativa del saldo) le resta lo ya cobrado con `PagoVenta` vigente.
  const montoPendienteCredito =
    ventaBloqueada.formaPago === FormaPago.CREDITO
      ? await calcularMontoPendienteCredito(
          ventaId,
          cuotas.reduce((suma, cuota) => suma + cuota.monto, 0),
        )
      : undefined;

  const { oseProveedor, credenciales } = await credencialesOseFacturables();
  const config = await configuracionDeLaEmpresa();
  if (!config?.certificadoPfxCifrado || !config.certificadoContrasenaCifrada) {
    throw new HttpError(409, 'Falta subir el certificado digital');
  }

  // Lectura completa (con relaciones) para armar el XML — autoritativa: el lock de arriba ya
  // serializa contra cualquier otra emisión/reintento/anulación concurrente de esta venta.
  const venta = await ventaRepository.findOne({
    where: { id: ventaId },
    relations: RELACIONES_VENTA_FACTURACION,
  });
  if (!venta) {
    throw new HttpError(404, 'Venta no encontrada');
  }

  // H16 — fail-closed ANTES de tocar el certificado/firma/OSE: si la venta tiene una
  // `snapshotFiscalVersion` desconocida (H16D-03), o tiene contrato H16 (`=1`) pero le falta
  // un campo obligatorio del snapshot de Empresa/Cliente/tasa IGV (H16D-01/H16D-02), esto
  // lanza acá mismo, sin construir XML, sin firmar, sin persistir un comprobante nuevo y sin
  // incrementar `intentos`.
  validarVersionSnapshotFiscalConocida(venta);
  const empresaFiscal = resolverDatosEmpresaFiscal(venta);
  const clienteFiscal = resolverDatosClienteFiscal(venta);
  validarSnapshotClienteCoherente(venta, clienteFiscal);

  const certificado = cargarPkcs12DesdeBuffer(
    descifrar(config.certificadoPfxCifrado),
    descifrarTexto(config.certificadoContrasenaCifrada),
  );
  const tasaIgv = await resolverTasaIgvFiscal(venta);
  const xml = construirXmlFactura({
    venta,
    empresaFiscal,
    clienteFiscal,
    tasaIgv,
    cuotas,
    montoPendienteCredito,
  });
  const { xmlFirmado, hash } = firmarXml(xml, certificado);
  const nombre = nombreArchivo(empresaFiscal.ruc, venta);

  const comprobante = comprobanteElectronicoRepository.create({ venta });
  comprobante.nombreArchivo = nombre;
  comprobante.xmlFirmado = xmlFirmado;
  comprobante.hashFirma = hash;
  comprobante.oseProveedor = oseProveedor;
  comprobante.intentos = (comprobante.intentos ?? 0) + 1;
  comprobante.estado = EstadoComprobante.ENVIANDO;
  const guardado = await comprobanteElectronicoRepository.save(comprobante);

  return {
    comprobanteId: guardado.id,
    numeroIntento: guardado.intentos,
    xmlFirmado,
    nombreArchivoComprobante: nombre,
    oseProveedor,
    credenciales,
  };
}

/**
 * PREPARAR de un reintento: solo procede desde `ERROR_ENVIO`, y NUNCA regenera ni refirma el
 * XML — un XML re-firmado tendría otro `DigestValue` y, para SUNAT, sería otro documento.
 */
async function prepararReintento(comprobanteId: string): Promise<PreparacionOse> {
  // Lectura SIN lock, solo para saber qué Venta bloquear a continuación — informativa, no
  // autoritativa. La relectura de la Venta y del propio comprobante, ya bajo lock, es la
  // única autoridad; si algo cambió entre esta lectura y el lock, esas relecturas lo detectan.
  const vista = await comprobanteElectronicoRepository.findOne({
    where: { id: comprobanteId },
    relations: { venta: true },
  });
  if (!vista) {
    throw new HttpError(404, 'Comprobante no encontrado');
  }
  const ventaId = vista.venta.id;

  // Orden global: Venta → Comprobante.
  const ventaBloqueada = await ventaRepository.findOne({
    where: { id: ventaId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!ventaBloqueada) {
    throw new HttpError(404, 'Venta no encontrada');
  }
  validarVentaFacturable(ventaBloqueada);

  const comprobante = await comprobanteElectronicoRepository.findOne({
    where: { id: comprobanteId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!comprobante) {
    throw new HttpError(404, 'Comprobante no encontrado');
  }
  if (comprobante.estado !== EstadoComprobante.ERROR_ENVIO) {
    // Cubre ENVIANDO/RESULTADO_INCIERTO/ACEPTADO/OBSERVADO/RECHAZADO/PENDIENTE por igual, sin
    // caso especial nuevo — solo ERROR_ENVIO es reintentable.
    throw new HttpError(409, 'Solo se puede reintentar un comprobante en error_envio');
  }

  // H15C-03/H15D-02: antes de H15, `construirXmlFactura` nunca emitía `<cac:PaymentTerms>` (no
  // existe en ningún commit previo a este cambio) — así que un `xmlFirmado`, de crédito O de
  // contado, sin la representación H15 esperada de la forma de pago (RS 193-2020/SUNAT, Anexo
  // IV) es, con certeza, anterior a H15. H13-B prohíbe reconstruirlo aquí (reutiliza el XML
  // firmado tal cual, nunca vuelve a firmar), así que no hay forma automática segura de
  // completarlo: se bloquea y se exige reconciliación fiscal/administrativa explícita, en vez de
  // reenviar a SUNAT un documento que sabemos incompleto. `xmlTienePaymentTermsValido`
  // (factura.builder.ts) es la única fuente de esta verificación — fail-closed: cualquier
  // ambigüedad bloquea, nunca deja pasar por omisión.
  if (!xmlTienePaymentTermsValido(comprobante.xmlFirmado, ventaBloqueada.formaPago)) {
    throw new HttpError(
      409,
      'Este comprobante es anterior a la representación de forma de pago de PaymentTerms ' +
        '(H15) y no se puede reintentar automáticamente: requiere reconciliación fiscal manual ' +
        'antes de reenviarse.',
    );
  }

  const { oseProveedor, credenciales } = await credencialesOseFacturables();

  comprobante.intentos += 1;
  comprobante.estado = EstadoComprobante.ENVIANDO;
  const guardado = await comprobanteElectronicoRepository.save(comprobante);

  return {
    comprobanteId: guardado.id,
    numeroIntento: guardado.intentos,
    xmlFirmado: guardado.xmlFirmado, // reutilizado tal cual, sin regenerar
    nombreArchivoComprobante: guardado.nombreArchivo, // reutilizado tal cual
    oseProveedor,
    credenciales,
  };
}

/**
 * Defensa adicional (H13B-02, revisión Codex), independiente de la disciplina que ya cumplen
 * los llamadores (`confirmarTransaccionDeLaPeticion()` siempre antes de `invocarOse`):
 * `invocarOse` comprueba por sí misma, justo antes de tocar la red, que no exista ninguna
 * transacción de la petición todavía activa — reusa `contextoActual()` (`tenant-context.ts`),
 * sin inventar un segundo mecanismo de contexto.
 *
 * `contexto.manager`/`contexto.queryRunner` son la única señal de "conexión todavía viva" (ver
 * `ContextoTenant` y `tenant.middleware.ts: cerrar()`, que los pone en `null` justo después del
 * COMMIT/ROLLBACK real, éxito o no). Por eso esto NUNCA lanza en los dos casos seguros:
 * - Sin contexto en absoluto (`contextoActual()` es `undefined`): fuera de una petición HTTP
 *   (scripts, pruebas directas del proveedor) — no hay ninguna transacción que pudiera estar
 *   activa.
 * - Contexto presente pero ya cerrado (`manager === null`): el caso normal tras el commit
 *   anticipado — la conexión ya se liberó, exactamente lo que H13 exige antes del OSE.
 *
 * Solo aborta cuando `manager` sigue apuntando a una conexión viva: la anomalía exacta que esta
 * defensa existe para atajar (un llamador que, por error, invocara al OSE sin haber confirmado
 * antes la transacción). Lanza fuera de cualquier `try/catch` que pudiera reclasificar esto como
 * `incierta` — es un error de programación, no una ambigüedad de transporte, y debe abortar la
 * petición (500) sin llamar al proveedor.
 */
function verificarSinTransaccionActivaAntesDeOse(): void {
  const contexto = contextoActual();
  if (contexto?.manager) {
    logger.error(
      'invocarOse: se intentó invocar al OSE con la transacción de la petición todavía activa (H13B-02)',
    );
    throw new HttpError(
      500,
      'No se puede invocar al OSE mientras la transacción de la petición sigue activa',
    );
  }
}

/** Red de seguridad ante un `OseProvider` que no respete su contrato ("no debería lanzar"):
 * cualquier excepción inesperada se trata como `incierta` (la clasificación más
 * conservadora — nunca se asume que un fallo desconocido significa "no transmitido"). */
async function invocarOse(
  proveedor: OseProvider,
  xmlFirmado: string,
  nombreArchivoComprobante: string,
  credenciales: CredencialesOse,
): Promise<ResultadoOse> {
  verificarSinTransaccionActivaAntesDeOse();
  try {
    return await proveedor.enviarComprobante(xmlFirmado, nombreArchivoComprobante, credenciales);
  } catch (error) {
    logger.error('El proveedor OSE lanzó una excepción inesperada (no debería ocurrir)', error);
    return {
      tipo: 'incierta',
      mensaje: error instanceof Error ? error.message : 'Fallo inesperado al comunicarse con el OSE',
    };
  }
}

function mapearResultadoOse(resultado: ResultadoOse): {
  estado: EstadoComprobante;
  codigoRespuesta: string | null;
  mensajeRespuesta: string;
  cdrXml: string | null;
} {
  if (resultado.tipo === 'definitiva') {
    return {
      estado: mapearEstado(resultado.codigoRespuesta),
      codigoRespuesta: resultado.codigoRespuesta,
      mensajeRespuesta: resultado.mensaje.slice(0, 500),
      cdrXml: resultado.cdrXml,
    };
  }
  return {
    estado:
      resultado.tipo === 'no_transmitido'
        ? EstadoComprobante.ERROR_ENVIO
        : EstadoComprobante.RESULTADO_INCIERTO,
    codigoRespuesta: null,
    mensajeRespuesta: resultado.mensaje.slice(0, 500),
    cdrXml: null,
  };
}

/**
 * FINALIZAR — transacción corta y propia (nueva conexión, con su propio `app.empresa_id`, ver
 * `ejecutarEnTransaccionPropia`), sin ninguna relación con la transacción HTTP ya confirmada.
 *
 * El `UPDATE` es un compare-and-swap explícito: solo aplica si la fila SIGUE exactamente como
 * la dejó PREPARAR (`estado='enviando' AND intentos=:numeroIntento`). Si `affected !== 1`, algo
 * más ya tocó esta fila (una respuesta atrasada de un intento anterior, una reconciliación
 * manual) — nunca se sobrescribe a ciegas: se registra como anomalía y se responde 500,
 * dejando la fila tal como esté para que se reconcilie a mano.
 */
async function finalizarEnvio(
  empresaId: string,
  comprobanteId: string,
  numeroIntento: number,
  resultado: ResultadoOse,
): Promise<ComprobanteElectronico> {
  return ejecutarEnTransaccionPropia(empresaId, async () => {
    const cambios = mapearResultadoOse(resultado);

    const resultadoUpdate = await comprobanteElectronicoRepository.update(
      { id: comprobanteId, estado: EstadoComprobante.ENVIANDO, intentos: numeroIntento },
      {
        estado: cambios.estado,
        cdrXml: cambios.cdrXml,
        codigoRespuesta: cambios.codigoRespuesta,
        mensajeRespuesta: cambios.mensajeRespuesta,
        enviadoEn: new Date(),
      },
    );

    if (resultadoUpdate.affected !== 1) {
      logger.error('FINALIZAR: el compare-and-swap no coincidió — anomalía de concurrencia', {
        comprobanteId,
        numeroIntento,
        affected: resultadoUpdate.affected,
      });
      throw new HttpError(
        500,
        'No se pudo registrar el resultado del envío de forma segura; requiere reconciliación manual',
      );
    }

    const actualizado = await comprobanteElectronicoRepository.findOneBy({ id: comprobanteId });
    if (!actualizado) {
      throw new HttpError(500, 'No se pudo recuperar el comprobante recién actualizado');
    }
    return actualizado;
  });
}

/**
 * Emite el comprobante electrónico de una venta ya registrada. Ver el comentario grande más
 * arriba ("Emisión — PREPARAR → COMMIT ANTICIPADO → OSE → FINALIZAR") para el diseño completo.
 */
export async function emitirComprobante(ventaId: string): Promise<ComprobanteElectronico> {
  const empresaId = empresaIdActual();

  const preparado = await prepararEmisionInicial(ventaId);
  await confirmarTransaccionDeLaPeticion();

  const resultado = await invocarOse(
    PROVEEDORES_OSE[preparado.oseProveedor],
    preparado.xmlFirmado,
    preparado.nombreArchivoComprobante,
    preparado.credenciales,
  );

  return finalizarEnvio(empresaId, preparado.comprobanteId, preparado.numeroIntento, resultado);
}

/** Reenvía un comprobante que quedó en `error_envio` — reusa el mismo XML ya firmado, no
 * reconstruye nada (un XML re-firmado con otro `DigestValue` sería, para SUNAT, otro documento). */
export async function reintentarEnvio(comprobanteId: string): Promise<ComprobanteElectronico> {
  const empresaId = empresaIdActual();

  const preparado = await prepararReintento(comprobanteId);
  await confirmarTransaccionDeLaPeticion();

  const resultado = await invocarOse(
    PROVEEDORES_OSE[preparado.oseProveedor],
    preparado.xmlFirmado,
    preparado.nombreArchivoComprobante,
    preparado.credenciales,
  );

  return finalizarEnvio(empresaId, preparado.comprobanteId, preparado.numeroIntento, resultado);
}

export async function obtenerComprobanteDeVenta(
  ventaId: string,
): Promise<ComprobanteElectronico | null> {
  return comprobanteElectronicoRepository.findOneBy({ venta: { id: ventaId } });
}
