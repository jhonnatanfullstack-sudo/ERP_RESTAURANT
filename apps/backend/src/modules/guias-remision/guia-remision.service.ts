import type { EntityManager } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { enTransaccion, empresaIdActual } from '../../database/tenant-context';
import { descifrar, descifrarTexto } from '../../utils/cifrado';
import {
  tipoComprobanteRepository,
  motivoTrasladoRepository,
  modalidadTrasladoRepository,
  unidadMedidaRepository,
} from '../catalogos/catalogos.repository';
import { CODIGO_GUIA_REMISION } from '../catalogos/codigos-sunat';
import { ventaRepository } from '../ventas/venta.repository';
import { Talonario } from '../talonario/talonario.entity';
import {
  calcularSiguienteNumero,
  listarTalonariosDeUsuario,
} from '../talonario/talonario.service';
import {
  configuracionFacturacionRepository,
} from '../facturacion/facturacion.repository';
import { cargarPkcs12DesdeBuffer } from '../facturacion/firma/certificado';
import { firmarXml } from '../facturacion/firma/firmador';
import { NubefactOseProvider } from '../facturacion/ose/nubefact-ose.provider';
import type { OseProvider, ResultadoOse } from '../facturacion/ose/ose-provider.interface';
import { ProveedorOse } from '../facturacion/configuracion-facturacion.entity';
import type { ConfiguracionFacturacion } from '../facturacion/configuracion-facturacion.entity';
import { EstadoComprobante } from '../facturacion/comprobante-electronico.entity';
import { guiaRemisionRepository } from './guia-remision.repository';
import { GuiaRemision, CodigoModalidadTraslado } from './guia-remision.entity';
import { DetalleGuiaRemision } from './detalle-guia-remision.entity';
import { construirXmlGuiaRemision, nombreArchivo } from './ubl/guia-remision.builder';
import type { CrearGuiaRemisionDto } from './guia-remision.dto';

const PROVEEDORES_OSE: Record<ProveedorOse, OseProvider> = {
  [ProveedorOse.NUBEFACT]: new NubefactOseProvider(),
};

const RELACIONES = {
  empresa: true,
  talonario: true,
  venta: true,
  motivoTraslado: true,
  modalidadTraslado: true,
  detalles: { unidadMedida: true },
} as const;

export async function listarGuiasRemision(): Promise<GuiaRemision[]> {
  return guiaRemisionRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
}

export async function obtenerGuiaRemision(id: string): Promise<GuiaRemision> {
  const guia = await guiaRemisionRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!guia) {
    throw new HttpError(404, 'Guía de remisión no encontrada');
  }
  return guia;
}

/** Igual criterio que `resolverTalonarioParaVenta`, pero sin el atajo de "serie fija": la GRE
 * es un módulo nuevo, así que sin talonario asignado la respuesta es pedir que se registre
 * uno, no inventar una serie por fuera del control de numeración. */
async function resolverTalonario(usuarioId: string, talonarioId?: string): Promise<Talonario> {
  const tipoComprobante = await tipoComprobanteRepository.findOneBy({
    codigo: CODIGO_GUIA_REMISION,
  });
  if (!tipoComprobante) {
    throw new HttpError(500, 'No está cargado el tipo de comprobante de guía de remisión');
  }

  const asignados = await listarTalonariosDeUsuario(usuarioId, tipoComprobante.id);

  if (talonarioId) {
    const elegido = asignados.find((t) => t.id === talonarioId);
    if (!elegido) {
      throw new HttpError(
        400,
        'El talonario indicado no está disponible para este usuario para guías de remisión',
        ['talonarioId inválido'],
      );
    }
    return elegido;
  }

  if (asignados.length === 0) {
    throw new HttpError(
      409,
      'No tienes ningún talonario de guía de remisión (serie T) asignado. Regístralo en Talonarios.',
    );
  }
  if (asignados.length > 1) {
    throw new HttpError(400, 'Tienes varios talonarios de guía de remisión: elige uno', [
      'talonarioId requerido',
    ]);
  }
  return asignados[0] as Talonario;
}

/** Índice único de `guias_remision (empresa, serie, numero)` — ver `guia-remision.entity.ts`. */
const INDICE_CORRELATIVO_GUIA = 'IDX_un_correlativo_por_serie_guia';
const UNIQUE_VIOLATION = '23505';
const MAXIMO_REINTENTOS_CORRELATIVO = 3;

function esColisionDeCorrelativo(error: unknown): boolean {
  const driverError = (error as { driverError?: { code?: string; constraint?: string } })
    ?.driverError;
  return (
    driverError?.code === UNIQUE_VIOLATION && driverError?.constraint === INDICE_CORRELATIVO_GUIA
  );
}

/** Mismo patrón que `reservarNumero` de `talonario.service.ts`, pero contra `guias_remision`
 * en vez de `ventas`: son libros de correlativos independientes, cada uno con su propio índice
 * único, así que no puede reusarse la consulta — sí la fórmula (`calcularSiguienteNumero`). */
async function reservarNumeroGuia(
  manager: EntityManager,
  talonarioId: string,
): Promise<{ serie: string; numero: number }> {
  const talonario = await manager.findOne(Talonario, {
    where: { id: talonarioId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!talonario) {
    throw new HttpError(400, 'El talonario indicado no existe', ['talonarioId inválido']);
  }
  if (!talonario.activo) {
    throw new HttpError(400, `El talonario ${talonario.serie} está inactivo`);
  }

  const fila = await manager
    .createQueryBuilder(GuiaRemision, 'guia')
    .select('MAX(guia.numero)', 'ultimo')
    .where('guia.serie = :serie', { serie: talonario.serie })
    .getRawOne<{ ultimo: string | null }>();
  const numero = calcularSiguienteNumero(talonario, Number(fila?.ultimo ?? 0));

  if (numero > talonario.numeroFin) {
    throw new HttpError(
      409,
      `El talonario ${talonario.serie} llegó a su último número autorizado (${talonario.numeroFin}). Registra un talonario nuevo.`,
    );
  }

  await manager.update(Talonario, talonario.id, { numeroActual: numero });
  return { serie: talonario.serie, numero };
}

async function guardarReintentandoColision(
  intentar: () => Promise<GuiaRemision>,
  serie: string,
): Promise<GuiaRemision> {
  for (let intento = 1; ; intento += 1) {
    try {
      return await intentar();
    } catch (error) {
      if (!esColisionDeCorrelativo(error) || intento >= MAXIMO_REINTENTOS_CORRELATIVO) {
        if (esColisionDeCorrelativo(error)) {
          throw new HttpError(
            409,
            `El correlativo de la serie ${serie} está siendo usado por otra guía en este momento. Vuelve a intentarlo.`,
          );
        }
        throw error;
      }
    }
  }
}

function validarTransportista(dto: CrearGuiaRemisionDto, codigoModalidad: string): void {
  if (codigoModalidad === CodigoModalidadTraslado.PRIVADO) {
    if (!dto.transportistaPlaca || !dto.transportistaLicencia) {
      throw new HttpError(
        400,
        'El transporte privado requiere la placa del vehículo y la licencia del conductor',
        ['transportistaPlaca', 'transportistaLicencia'],
      );
    }
    return;
  }
  if (!dto.transportistaRuc || !dto.transportistaRazonSocial) {
    throw new HttpError(
      400,
      'El transporte público requiere el RUC y la razón social de la empresa de transporte',
      ['transportistaRuc', 'transportistaRazonSocial'],
    );
  }
}

export async function crearGuiaRemision(
  usuarioId: string,
  dto: CrearGuiaRemisionDto,
): Promise<GuiaRemision> {
  const talonario = await resolverTalonario(usuarioId, dto.talonarioId);

  const motivoTraslado = await motivoTrasladoRepository.findOneBy({ id: dto.motivoTrasladoId });
  if (!motivoTraslado) {
    throw new HttpError(400, 'El motivo de traslado indicado no existe', [
      'motivoTrasladoId inválido',
    ]);
  }
  const modalidadTraslado = await modalidadTrasladoRepository.findOneBy({
    id: dto.modalidadTrasladoId,
  });
  if (!modalidadTraslado) {
    throw new HttpError(400, 'La modalidad de traslado indicada no existe', [
      'modalidadTrasladoId inválido',
    ]);
  }
  validarTransportista(dto, modalidadTraslado.codigo);

  const venta = dto.ventaId ? await ventaRepository.findOneBy({ id: dto.ventaId }) : null;
  if (dto.ventaId && !venta) {
    throw new HttpError(400, 'La venta indicada no existe', ['ventaId inválido']);
  }

  const detallesResueltos = await Promise.all(
    dto.detalles.map(async (linea) => {
      const unidadMedida = await unidadMedidaRepository.findOneBy({ id: linea.unidadMedidaId });
      if (!unidadMedida) {
        throw new HttpError(400, 'La unidad de medida de un ítem no existe', [
          'detalles.unidadMedidaId inválido',
        ]);
      }
      return { descripcion: linea.descripcion, cantidad: linea.cantidad, unidadMedida };
    }),
  );

  const intentarGuardar = () =>
    enTransaccion(async (manager) => {
      const { serie, numero } = await reservarNumeroGuia(manager, talonario.id);

      const guia = manager.create(GuiaRemision, {
        talonario,
        serie,
        numero,
        venta,
        motivoTraslado,
        modalidadTraslado,
        fechaTraslado: dto.fechaTraslado,
        pesoTotalKg: dto.pesoTotalKg,
        numeroBultos: dto.numeroBultos ?? null,
        partidaDireccion: dto.partidaDireccion,
        partidaUbigeo: dto.partidaUbigeo ?? null,
        llegadaDireccion: dto.llegadaDireccion,
        llegadaUbigeo: dto.llegadaUbigeo ?? null,
        destinatarioNumeroDocumento: dto.destinatarioNumeroDocumento ?? null,
        destinatarioNombre: dto.destinatarioNombre ?? null,
        transportistaPlaca: dto.transportistaPlaca ?? null,
        transportistaLicencia: dto.transportistaLicencia ?? null,
        transportistaRuc: dto.transportistaRuc ?? null,
        transportistaRazonSocial: dto.transportistaRazonSocial ?? null,
        observacion: dto.observacion ?? null,
        // Se completan recién al emitir (`emitirGuiaRemision`): antes de firmar no hay XML.
        nombreArchivo: `PENDIENTE-${talonario.serie}-${numero}-${Date.now()}`,
        estado: EstadoComprobante.PENDIENTE,
        xmlFirmado: '',
        hashFirma: '',
      });
      const guardada = await manager.save(GuiaRemision, guia);

      const detalles = detallesResueltos.map((linea) =>
        manager.create(DetalleGuiaRemision, { ...linea, guiaRemision: guardada }),
      );
      await manager.save(DetalleGuiaRemision, detalles);

      return guardada;
    });

  const guardada = await guardarReintentandoColision(intentarGuardar, talonario.serie);
  return obtenerGuiaRemision(guardada.id);
}

function mapearEstado(codigoRespuesta: string | null): EstadoComprobante {
  if (codigoRespuesta === null) return EstadoComprobante.ERROR_ENVIO;
  if (codigoRespuesta === '0') return EstadoComprobante.ACEPTADO;
  if (codigoRespuesta.startsWith('4')) return EstadoComprobante.OBSERVADO;
  return EstadoComprobante.RECHAZADO;
}

async function configuracionDeLaEmpresa(): Promise<ConfiguracionFacturacion | null> {
  return configuracionFacturacionRepository.findOneBy({ empresa: { id: empresaIdActual() } });
}

async function enviarYRegistrar(
  guia: GuiaRemision,
  xmlFirmado: string,
  nombreArchivoGuia: string,
  proveedor: OseProvider,
  config: ConfiguracionFacturacion,
): Promise<GuiaRemision> {
  let resultado: ResultadoOse;
  try {
    resultado = await proveedor.enviarComprobante(xmlFirmado, nombreArchivoGuia, {
      usuario: config.oseUsuario!,
      clave: descifrarTexto(config.oseCredencialCifrada!),
      ambiente: config.ambiente,
    });
  } catch (error) {
    resultado = {
      tipo: 'incierta',
      mensaje: error instanceof Error ? error.message : 'Fallo inesperado al enviar al OSE',
    };
  }

  // Este módulo (a diferencia de `facturacion.service.ts`, ver H13) todavía no distingue
  // `error_envio` de `resultado_incierto`: cualquier resultado que no sea una respuesta
  // definitiva del OSE se trata igual que antes de H13 (siempre como no exitoso, sin CDR),
  // preservando el comportamiento existente sin adelantar ese rediseño a este módulo.
  const codigoRespuesta = resultado.tipo === 'definitiva' ? resultado.codigoRespuesta.slice(0, 10) : null;
  const cdrXml = resultado.tipo === 'definitiva' ? resultado.cdrXml : null;

  guia.estado = mapearEstado(codigoRespuesta);
  guia.cdrXml = cdrXml;
  guia.codigoRespuesta = codigoRespuesta;
  guia.mensajeRespuesta = resultado.mensaje.slice(0, 500);
  guia.intentos += 1;
  guia.enviadoEn = new Date();
  return guiaRemisionRepository.save(guia);
}

/** Emite la GRE ya registrada: arma el XML UBL 2.1 (`ubl/guia-remision.builder.ts`), lo firma
 * con el certificado de la empresa (reusa `modules/facturacion/firma`, sin cambios) y lo envía
 * al mismo OSE configurado para factura/boleta — es un solo certificado y una sola cuenta OSE
 * por empresa, cualquiera sea el tipo de comprobante. Mismo criterio que
 * `facturacion.service.ts: emitirComprobante`: paso explícito, no automático al crear. */
export async function emitirGuiaRemision(id: string): Promise<GuiaRemision> {
  const guia = await obtenerGuiaRemision(id);
  if (guia.estado !== EstadoComprobante.PENDIENTE && guia.estado !== EstadoComprobante.ERROR_ENVIO) {
    throw new HttpError(409, 'Esta guía de remisión ya fue enviada');
  }

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
  if (!config.certificadoPfxCifrado || !config.certificadoContrasenaCifrada) {
    throw new HttpError(409, 'Falta subir el certificado digital');
  }

  const certificado = cargarPkcs12DesdeBuffer(
    descifrar(config.certificadoPfxCifrado),
    descifrarTexto(config.certificadoContrasenaCifrada),
  );
  const xml = construirXmlGuiaRemision({ guia, empresa: guia.empresa });
  const { xmlFirmado, hash } = firmarXml(xml, certificado);
  const nombre = nombreArchivo(guia.empresa, guia);

  guia.nombreArchivo = nombre;
  guia.xmlFirmado = xmlFirmado;
  guia.hashFirma = hash;
  guia.estado = EstadoComprobante.PENDIENTE;
  guia.oseProveedor = config.oseProveedor;
  const guardada = await guiaRemisionRepository.save(guia);

  return enviarYRegistrar(guardada, xmlFirmado, nombre, PROVEEDORES_OSE[config.oseProveedor], config);
}

/** Reenvía una guía que quedó en `error_envio` — reusa el mismo XML ya firmado. */
export async function reintentarEnvioGuia(id: string): Promise<GuiaRemision> {
  const guia = await obtenerGuiaRemision(id);
  if (guia.estado !== EstadoComprobante.ERROR_ENVIO) {
    throw new HttpError(409, 'Solo se puede reintentar una guía en error_envio');
  }

  const config = await configuracionDeLaEmpresa();
  if (!config?.oseProveedor || !config.oseUsuario || !config.oseCredencialCifrada) {
    throw new HttpError(409, 'Falta configurar el OSE de la empresa');
  }

  return enviarYRegistrar(
    guia,
    guia.xmlFirmado,
    guia.nombreArchivo,
    PROVEEDORES_OSE[config.oseProveedor],
    config,
  );
}

