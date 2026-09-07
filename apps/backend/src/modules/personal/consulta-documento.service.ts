import { env } from '../../config/env';
import { HttpError } from '../../utils/http-error';

export interface DatosDocumento {
  numeroDocumento: string;
  nombres: string;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
}

/**
 * Consulta datos de un DNI (RENIEC) o RUC (SUNAT) vía apis.net.pe.
 * Requiere APIS_NET_PE_TOKEN configurado; si no está presente, el
 * servicio se considera no disponible (503) en vez de fallar el arranque
 * de la app, ya que es una integración opcional.
 *
 * NOTA: el mapeo de campos de la respuesta de apis.net.pe se hizo según
 * su documentación pública; verificar contra una respuesta real la
 * primera vez que se use, por si el proveedor cambió el contrato.
 */
export async function consultarDocumento(
  tipo: 'dni' | 'ruc',
  numero: string,
): Promise<DatosDocumento> {
  if (!env.apisNetPe.token) {
    throw new HttpError(503, 'El servicio de consulta de documentos no está configurado');
  }

  const recurso = tipo === 'dni' ? 'reniec/dni' : 'sunat/ruc';
  const url = `${env.apisNetPe.baseUrl}/${recurso}?numero=${encodeURIComponent(numero)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${env.apisNetPe.token}` },
      signal: controller.signal,
    });
  } catch {
    throw new HttpError(502, 'No se pudo consultar el documento, intente nuevamente');
  } finally {
    clearTimeout(timeout);
  }

  if (respuesta.status === 404) {
    throw new HttpError(404, 'No se encontró el documento consultado');
  }
  if (!respuesta.ok) {
    throw new HttpError(502, 'No se pudo consultar el documento, intente nuevamente');
  }

  const datos = (await respuesta.json()) as Record<string, unknown>;

  if (tipo === 'dni') {
    return {
      numeroDocumento: String(datos.numeroDocumento ?? numero),
      nombres: String(datos.nombres ?? ''),
      apellidoPaterno: (datos.apellidoPaterno as string | undefined) ?? null,
      apellidoMaterno: (datos.apellidoMaterno as string | undefined) ?? null,
    };
  }

  return {
    numeroDocumento: String(datos.numeroDocumento ?? numero),
    nombres: String(datos.nombre ?? datos.razonSocial ?? ''),
    apellidoPaterno: null,
    apellidoMaterno: null,
  };
}
