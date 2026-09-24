import { HttpError } from '../../utils/http-error';
import { empresaIdActual } from '../../database/tenant-context';
import { cifrar, descifrar, descifrarTexto } from '../../utils/cifrado';
import { resolverTasaIgv } from '../empresa/igv.service';
import { ventaRepository } from '../ventas/venta.repository';
import { EstadoVenta, type Venta } from '../ventas/venta.entity';
import { construirXmlFactura, nombreArchivo } from './ubl/factura.builder';
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
import type { OseProvider, RespuestaOse } from './ose/ose-provider.interface';
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

// --- Emisión ---------------------------------------------------------------------------

function mapearEstado(codigoRespuesta: string | null): EstadoComprobante {
  if (codigoRespuesta === null) return EstadoComprobante.ERROR_ENVIO;
  if (codigoRespuesta === '0') return EstadoComprobante.ACEPTADO;
  if (codigoRespuesta.startsWith('4')) return EstadoComprobante.OBSERVADO;
  return EstadoComprobante.RECHAZADO;
}

function validarVentaFacturable(venta: Pick<Venta, 'estado'>): void {
  if (venta.estado === EstadoVenta.ANULADA) {
    throw new HttpError(409, 'No se puede emitir un comprobante para una venta anulada');
  }
}

async function enviarYRegistrar(
  comprobante: ComprobanteElectronico,
  xmlFirmado: string,
  nombreArchivoComprobante: string,
  proveedor: OseProvider,
  config: ConfiguracionFacturacion,
): Promise<ComprobanteElectronico> {
  let respuesta: RespuestaOse;
  try {
    respuesta = await proveedor.enviarComprobante(xmlFirmado, nombreArchivoComprobante, {
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

  // Defensa ante un OSE que devuelva un código más largo de lo que SUNAT documenta (la
  // columna es `varchar(10)`): mejor perder el detalle exacto que hacer fallar todo el
  // registro del intento con un error de base de datos.
  const codigoRespuesta = respuesta.codigoRespuesta?.slice(0, 10) ?? null;

  comprobante.estado = mapearEstado(codigoRespuesta);
  comprobante.cdrXml = respuesta.cdrXml;
  comprobante.codigoRespuesta = codigoRespuesta;
  comprobante.mensajeRespuesta = respuesta.mensaje.slice(0, 500);
  comprobante.intentos += 1;
  comprobante.enviadoEn = new Date();
  return comprobanteElectronicoRepository.save(comprobante);
}

/**
 * Emite el comprobante electrónico de una venta ya registrada: arma el XML UBL 2.1
 * (`ubl/factura.builder.ts`, sin cambios), lo firma con el certificado de la empresa
 * (`firma/firmador.ts`, sin cambios) y lo envía al OSE configurado.
 *
 * **Por qué es una acción explícita y no automática al crear la venta.** Cada petición corre
 * dentro de una única transacción de base de datos (`tenant.middleware.ts`); encadenar acá una
 * llamada de red a un servicio externo dejaría la respuesta de "venta creada" —y la conexión a
 * la base— esperando al OSE, que puede tardar varios segundos o fallar. Emitir como un paso
 * aparte, disparado desde la interfaz después de que la venta ya se guardó, es más simple, no
 * arriesga la venta si el OSE está caído, y es la UX habitual de un POS: el cajero ve el estado
 * del comprobante y puede reintentarlo sin tocar la venta.
 */
export async function emitirComprobante(ventaId: string): Promise<ComprobanteElectronico> {
  const venta = await ventaRepository.findOne({
    where: { id: ventaId },
    relations: RELACIONES_VENTA_FACTURACION,
  });
  if (!venta) {
    throw new HttpError(404, 'Venta no encontrada');
  }
  validarVentaFacturable(venta);

  const existente = await comprobanteElectronicoRepository.findOneBy({ venta: { id: venta.id } });
  if (existente && existente.estado !== EstadoComprobante.ERROR_ENVIO) {
    throw new HttpError(409, 'Esta venta ya tiene un comprobante electrónico emitido');
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
  const xml = construirXmlFactura({ venta, empresa: venta.empresa, tasaIgv });
  const { xmlFirmado, hash } = firmarXml(xml, certificado);
  const nombre = nombreArchivo(venta.empresa, venta);

  const comprobante = existente ?? comprobanteElectronicoRepository.create({ venta });
  comprobante.nombreArchivo = nombre;
  comprobante.xmlFirmado = xmlFirmado;
  comprobante.hashFirma = hash;
  comprobante.estado = EstadoComprobante.PENDIENTE;
  comprobante.oseProveedor = config.oseProveedor;
  const guardado = await comprobanteElectronicoRepository.save(comprobante);

  return enviarYRegistrar(
    guardado,
    xmlFirmado,
    nombre,
    PROVEEDORES_OSE[config.oseProveedor],
    config,
  );
}

/** Reenvía un comprobante que quedó en `error_envio` — reusa el mismo XML ya firmado, no
 * reconstruye nada (un XML re-firmado con otro `DigestValue` sería, para SUNAT, otro documento). */
export async function reintentarEnvio(comprobanteId: string): Promise<ComprobanteElectronico> {
  const comprobante = await comprobanteElectronicoRepository.findOne({
    where: { id: comprobanteId },
    relations: { venta: true },
  });
  if (!comprobante) {
    throw new HttpError(404, 'Comprobante no encontrado');
  }
  if (comprobante.estado !== EstadoComprobante.ERROR_ENVIO) {
    throw new HttpError(409, 'Solo se puede reintentar un comprobante en error_envio');
  }
  validarVentaFacturable(comprobante.venta);

  const config = await configuracionDeLaEmpresa();
  if (!config?.oseProveedor || !config.oseUsuario || !config.oseCredencialCifrada) {
    throw new HttpError(409, 'Falta configurar el OSE de la empresa');
  }

  return enviarYRegistrar(
    comprobante,
    comprobante.xmlFirmado,
    comprobante.nombreArchivo,
    PROVEEDORES_OSE[config.oseProveedor],
    config,
  );
}

export async function obtenerComprobanteDeVenta(
  ventaId: string,
): Promise<ComprobanteElectronico | null> {
  return comprobanteElectronicoRepository.findOneBy({ venta: { id: ventaId } });
}
