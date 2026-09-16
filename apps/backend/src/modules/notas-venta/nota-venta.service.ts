import type { EntityManager } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { enTransaccion, empresaIdActual } from '../../database/tenant-context';
import { descifrar, descifrarTexto } from '../../utils/cifrado';
import { CODIGO_AFECTACION_GRAVADO, resolverTasaIgv } from '../empresa/igv.service';
import { tipoComprobanteRepository, tipoAfectacionIgvRepository } from '../catalogos/catalogos.repository';
import { motivoNotaRepository } from '../catalogos/catalogos.repository';
import { ventaRepository } from '../ventas/venta.repository';
import { Venta, EstadoVenta } from '../ventas/venta.entity';
import { Talonario } from '../talonario/talonario.entity';
import { calcularSiguienteNumero, listarTalonariosDeUsuario } from '../talonario/talonario.service';
import { configuracionFacturacionRepository } from '../facturacion/facturacion.repository';
import { cargarPkcs12DesdeBuffer } from '../facturacion/firma/certificado';
import { firmarXml } from '../facturacion/firma/firmador';
import { NubefactOseProvider } from '../facturacion/ose/nubefact-ose.provider';
import type { OseProvider, RespuestaOse } from '../facturacion/ose/ose-provider.interface';
import { ProveedorOse } from '../facturacion/configuracion-facturacion.entity';
import type { ConfiguracionFacturacion } from '../facturacion/configuracion-facturacion.entity';
import { EstadoComprobante } from '../facturacion/comprobante-electronico.entity';
import { comprobanteElectronicoRepository } from '../facturacion/facturacion.repository';
import { notaVentaRepository } from './nota-venta.repository';
import { NotaVenta } from './nota-venta.entity';
import { DetalleNotaVenta } from './detalle-nota-venta.entity';
import { construirXmlNotaCredito } from './ubl/nota-credito.builder';
import { construirXmlNotaDebito } from './ubl/nota-debito.builder';
import { nombreArchivo } from './ubl/nota-comun';
import type { CrearNotaCreditoDto, CrearNotaDebitoDto } from './nota-venta.dto';

/** Catálogo N° 01 — código de Nota de Crédito/Débito (mismos que en `codigos-sunat.ts`, pero
 * ese archivo es de Talonarios/Ventas; acá se repiten como literales locales porque no vale la
 * pena una dependencia cruzada para dos strings). */
const CODIGO_NOTA_CREDITO = '07';
const CODIGO_NOTA_DEBITO = '08';

const PROVEEDORES_OSE: Record<ProveedorOse, OseProvider> = {
  [ProveedorOse.NUBEFACT]: new NubefactOseProvider(),
};

const RELACIONES = {
  empresa: true,
  talonario: true,
  tipoComprobante: true,
  motivo: true,
  venta: { cliente: { tipoDocumentoIdentidad: true }, tipoComprobante: true },
  detalles: { producto: { unidadMedida: true }, tipoAfectacionIgv: true },
} as const;

function ordenarDetalles(nota: NotaVenta): NotaVenta {
  nota.detalles?.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
  return nota;
}

export async function listarNotasVenta(): Promise<NotaVenta[]> {
  const notas = await notaVentaRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
  return notas.map(ordenarDetalles);
}

export async function obtenerNotaVenta(id: string): Promise<NotaVenta> {
  const nota = await notaVentaRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!nota) {
    throw new HttpError(404, 'Nota no encontrada');
  }
  return ordenarDetalles(nota);
}

/** La venta a corregir/complementar debe tener ya un comprobante electrónico que SUNAT haya
 * recibido: una nota sin eso no tiene nada que referenciar. `observado` también sirve —el
 * comprobante es válido igual, solo trae observaciones. */
async function ventaConComprobanteAceptado(ventaId: string): Promise<Venta> {
  const venta = await ventaRepository.findOne({
    where: { id: ventaId },
    relations: {
      empresa: true,
      cliente: { tipoDocumentoIdentidad: true },
      tipoComprobante: true,
      detalles: { producto: { unidadMedida: true }, tipoAfectacionIgv: true },
    },
  });
  if (!venta) {
    throw new HttpError(400, 'La venta indicada no existe', ['ventaId inválido']);
  }
  const comprobante = await comprobanteElectronicoRepository.findOneBy({ venta: { id: ventaId } });
  if (
    !comprobante ||
    (comprobante.estado !== EstadoComprobante.ACEPTADO &&
      comprobante.estado !== EstadoComprobante.OBSERVADO)
  ) {
    throw new HttpError(
      409,
      'Esta venta no tiene un comprobante electrónico aceptado por SUNAT: no corresponde emitir una nota',
    );
  }
  return venta;
}

async function resolverTalonarioNota(
  usuarioId: string,
  codigoTipoComprobante: string,
  talonarioId: string,
): Promise<Talonario> {
  const tipoComprobante = await tipoComprobanteRepository.findOneBy({
    codigo: codigoTipoComprobante,
  });
  if (!tipoComprobante) {
    throw new HttpError(500, 'No está cargado el tipo de comprobante de la nota');
  }

  const asignados = await listarTalonariosDeUsuario(usuarioId, tipoComprobante.id);
  const elegido = asignados.find((t) => t.id === talonarioId);
  if (!elegido) {
    throw new HttpError(400, 'El talonario indicado no está disponible para este usuario', [
      'talonarioId inválido',
    ]);
  }
  return elegido as Talonario;
}

async function resolverMotivo(tipoDocumento: string, motivoId: string) {
  const motivo = await motivoNotaRepository.findOneBy({ id: motivoId, tipoDocumento });
  if (!motivo) {
    throw new HttpError(400, 'El motivo indicado no existe para este tipo de nota', [
      'motivoId inválido',
    ]);
  }
  return motivo;
}

/** Índice único de `notas_venta (empresa, serie, numero)` — ver `nota-venta.entity.ts`. */
const INDICE_CORRELATIVO_NOTA = 'IDX_un_correlativo_por_serie_nota';
const UNIQUE_VIOLATION = '23505';
const MAXIMO_REINTENTOS_CORRELATIVO = 3;

function esColisionDeCorrelativo(error: unknown): boolean {
  const driverError = (error as { driverError?: { code?: string; constraint?: string } })
    ?.driverError;
  return driverError?.code === UNIQUE_VIOLATION && driverError?.constraint === INDICE_CORRELATIVO_NOTA;
}

/** Mismo patrón que `guia-remision.service.ts: reservarNumeroGuia`, contra `notas_venta`. */
async function reservarNumeroNota(
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
    .createQueryBuilder(NotaVenta, 'nota')
    .select('MAX(nota.numero)', 'ultimo')
    .where('nota.serie = :serie', { serie: talonario.serie })
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
  intentar: () => Promise<NotaVenta>,
  serie: string,
): Promise<NotaVenta> {
  for (let intento = 1; ; intento += 1) {
    try {
      return await intentar();
    } catch (error) {
      if (!esColisionDeCorrelativo(error) || intento >= MAXIMO_REINTENTOS_CORRELATIVO) {
        if (esColisionDeCorrelativo(error)) {
          throw new HttpError(
            409,
            `El correlativo de la serie ${serie} está siendo usado por otra nota en este momento. Vuelve a intentarlo.`,
          );
        }
        throw error;
      }
    }
  }
}

/**
 * Nota de Crédito: corrige el 100% de la venta indicada (anulación, devolución total, error de
 * RUC…), clonando todas sus líneas con los mismos montos. Al registrarla, la venta pasa a
 * `anulada` de inmediato —es la corrección la que hace válido ese cambio de estado ante SUNAT,
 * a diferencia de `venta.service.ts: anularVenta`, que ahora rechaza anular una venta que ya
 * tiene comprobante aceptado (ver ese archivo)—; que el envío a SUNAT quede pendiente o falle
 * después no cambia esa realidad comercial, igual que el estado de una `Venta` no depende de si
 * su `ComprobanteElectronico` ya fue aceptado.
 */
export async function crearNotaCredito(
  usuarioId: string,
  dto: CrearNotaCreditoDto,
): Promise<NotaVenta> {
  const venta = await ventaConComprobanteAceptado(dto.ventaId);
  if (venta.estado === EstadoVenta.ANULADA) {
    throw new HttpError(409, 'Esta venta ya está anulada');
  }

  const talonario = await resolverTalonarioNota(usuarioId, CODIGO_NOTA_CREDITO, dto.talonarioId);
  const motivo = await resolverMotivo(CODIGO_NOTA_CREDITO, dto.motivoId);
  const tipoComprobante = talonario.tipoComprobante;

  const intentarGuardar = () =>
    enTransaccion(async (manager) => {
      const { serie, numero } = await reservarNumeroNota(manager, talonario.id);

      const nota = manager.create(NotaVenta, {
        talonario,
        serie,
        numero,
        tipoComprobante,
        venta,
        motivo,
        descripcionSustento: dto.descripcionSustento ?? null,
        subtotal: venta.subtotal,
        igv: venta.igv,
        total: venta.total,
        nombreArchivo: `PENDIENTE-${talonario.serie}-${numero}-${Date.now()}`,
        estado: EstadoComprobante.PENDIENTE,
        xmlFirmado: '',
        hashFirma: '',
      });
      const guardada = await manager.save(NotaVenta, nota);

      const detalles = venta.detalles.map((linea) =>
        manager.create(DetalleNotaVenta, {
          notaVenta: guardada,
          producto: linea.producto,
          descripcionProducto: linea.descripcionProducto,
          cantidad: linea.cantidad,
          precioUnitario: linea.precioUnitario,
          tipoAfectacionIgv: linea.tipoAfectacionIgv,
          valorVenta: linea.valorVenta,
          igv: linea.igv,
          subtotal: linea.subtotal,
        }),
      );
      await manager.save(DetalleNotaVenta, detalles);

      venta.estado = EstadoVenta.ANULADA;
      await manager.save(Venta, venta);

      return guardada;
    });

  const guardada = await guardarReintentandoColision(intentarGuardar, talonario.serie);
  return obtenerNotaVenta(guardada.id);
}

/**
 * Nota de Débito: un cargo adicional sobre la venta indicada (interés moratorio, penalidad…),
 * como una línea nueva y libre gravada con IGV a la tasa vigente de la empresa — no toca el
 * estado de la venta original, que sigue vendida y facturada tal cual.
 */
export async function crearNotaDebito(usuarioId: string, dto: CrearNotaDebitoDto): Promise<NotaVenta> {
  const venta = await ventaConComprobanteAceptado(dto.ventaId);
  const talonario = await resolverTalonarioNota(usuarioId, CODIGO_NOTA_DEBITO, dto.talonarioId);
  const motivo = await resolverMotivo(CODIGO_NOTA_DEBITO, dto.motivoId);
  const tipoComprobante = talonario.tipoComprobante;

  const tipoAfectacionGravado = await tipoAfectacionIgvRepository.findOneBy({
    codigo: CODIGO_AFECTACION_GRAVADO,
  });
  if (!tipoAfectacionGravado) {
    throw new HttpError(500, 'No está cargado el catálogo de afectación al IGV');
  }
  const tasaIgv = await resolverTasaIgv();
  const valorVenta = Math.round((dto.monto / (1 + tasaIgv)) * 100) / 100;
  const igv = Math.round((dto.monto - valorVenta) * 100) / 100;

  const intentarGuardar = () =>
    enTransaccion(async (manager) => {
      const { serie, numero } = await reservarNumeroNota(manager, talonario.id);

      const nota = manager.create(NotaVenta, {
        talonario,
        serie,
        numero,
        tipoComprobante,
        venta,
        motivo,
        descripcionSustento: dto.descripcionSustento ?? null,
        subtotal: valorVenta,
        igv,
        total: dto.monto,
        nombreArchivo: `PENDIENTE-${talonario.serie}-${numero}-${Date.now()}`,
        estado: EstadoComprobante.PENDIENTE,
        xmlFirmado: '',
        hashFirma: '',
      });
      const guardada = await manager.save(NotaVenta, nota);

      const detalle = manager.create(DetalleNotaVenta, {
        notaVenta: guardada,
        producto: null,
        descripcionProducto: dto.concepto,
        cantidad: 1,
        precioUnitario: dto.monto,
        tipoAfectacionIgv: tipoAfectacionGravado,
        valorVenta,
        igv,
        subtotal: dto.monto,
      });
      await manager.save(DetalleNotaVenta, detalle);

      return guardada;
    });

  const guardada = await guardarReintentandoColision(intentarGuardar, talonario.serie);
  return obtenerNotaVenta(guardada.id);
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
  nota: NotaVenta,
  xmlFirmado: string,
  nombreArchivoNota: string,
  proveedor: OseProvider,
  config: ConfiguracionFacturacion,
): Promise<NotaVenta> {
  let respuesta: RespuestaOse;
  try {
    respuesta = await proveedor.enviarComprobante(xmlFirmado, nombreArchivoNota, {
      usuario: config.oseUsuario!,
      clave: descifrarTexto(config.oseCredencialCifrada!),
      ambiente: config.ambiente,
    });
  } catch (error) {
    respuesta = {
      codigoRespuesta: null,
      mensaje: error instanceof Error ? error.message : 'Fallo inesperado al enviar al OSE',
      cdrXml: null,
    };
  }

  const codigoRespuesta = respuesta.codigoRespuesta?.slice(0, 10) ?? null;

  nota.estado = mapearEstado(codigoRespuesta);
  nota.cdrXml = respuesta.cdrXml;
  nota.codigoRespuesta = codigoRespuesta;
  nota.mensajeRespuesta = respuesta.mensaje.slice(0, 500);
  nota.intentos += 1;
  nota.enviadoEn = new Date();
  return notaVentaRepository.save(nota);
}

/** Emite la nota ya registrada: arma el XML UBL 2.1 según su tipo, lo firma con el certificado
 * de la empresa (reusa `modules/facturacion/firma`, sin cambios) y lo envía al mismo OSE
 * configurado para factura/boleta/guía. Mismo criterio que `emitirComprobante`/
 * `emitirGuiaRemision`: paso explícito, no automático al crear. */
export async function emitirNotaVenta(id: string): Promise<NotaVenta> {
  const nota = await obtenerNotaVenta(id);
  if (nota.estado !== EstadoComprobante.PENDIENTE && nota.estado !== EstadoComprobante.ERROR_ENVIO) {
    throw new HttpError(409, 'Esta nota ya fue enviada');
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
  const tasaIgv = await resolverTasaIgv();
  const xml =
    nota.tipoComprobante.codigo === CODIGO_NOTA_CREDITO
      ? construirXmlNotaCredito({ nota, empresa: nota.empresa, tasaIgv })
      : construirXmlNotaDebito({ nota, empresa: nota.empresa, tasaIgv });
  const { xmlFirmado, hash } = firmarXml(xml, certificado);
  const nombre = nombreArchivo(nota.empresa, nota);

  nota.nombreArchivo = nombre;
  nota.xmlFirmado = xmlFirmado;
  nota.hashFirma = hash;
  nota.estado = EstadoComprobante.PENDIENTE;
  nota.oseProveedor = config.oseProveedor;
  const guardada = await notaVentaRepository.save(nota);

  return enviarYRegistrar(guardada, xmlFirmado, nombre, PROVEEDORES_OSE[config.oseProveedor], config);
}

/** Reenvía una nota que quedó en `error_envio` — reusa el mismo XML ya firmado. */
export async function reintentarEnvioNota(id: string): Promise<NotaVenta> {
  const nota = await obtenerNotaVenta(id);
  if (nota.estado !== EstadoComprobante.ERROR_ENVIO) {
    throw new HttpError(409, 'Solo se puede reintentar una nota en error_envio');
  }

  const config = await configuracionDeLaEmpresa();
  if (!config?.oseProveedor || !config.oseUsuario || !config.oseCredencialCifrada) {
    throw new HttpError(409, 'Falta configurar el OSE de la empresa');
  }

  return enviarYRegistrar(
    nota,
    nota.xmlFirmado,
    nota.nombreArchivo,
    PROVEEDORES_OSE[config.oseProveedor],
    config,
  );
}

/** Notas ya emitidas de una venta — usado por Ventas para mostrar el enlace "Ver notas" y por
 * `venta.service.ts: anularVenta` para explicar por qué no puede anularse directamente. */
export async function listarNotasDeVenta(ventaId: string): Promise<NotaVenta[]> {
  const notas = await notaVentaRepository.find({
    where: { venta: { id: ventaId } },
    relations: RELACIONES,
    order: { creadoEn: 'DESC' },
  });
  return notas.map(ordenarDetalles);
}
