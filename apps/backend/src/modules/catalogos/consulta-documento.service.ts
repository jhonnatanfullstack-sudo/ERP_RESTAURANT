import { env } from '../../config/env';
import { HttpError } from '../../utils/http-error';

export interface DatosDocumento {
  numeroDocumento: string;
  nombres: string;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
}

/**
 * Consulta datos de un DNI (RENIEC) o RUC (SUNAT) vía la API de apis.net.pe,
 * que desde su migración a la infraestructura de Decolecta expone sus
 * endpoints en https://api.decolecta.com/v1 (no en el dominio/version
 * antiguos). Requiere APIS_NET_PE_TOKEN configurado; si no está presente,
 * el servicio se considera no disponible (503) en vez de fallar el arranque
 * de la app, ya que es una integración opcional.
 *
 * Compartido entre Personal y Clientes (ambos permiten buscar datos por
 * documento SUNAT), para no duplicar la integración externa.
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

  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { message?: string } | null;
    const detalle = cuerpo?.message;

    if (respuesta.status === 404) {
      throw new HttpError(404, 'No se encontró el documento consultado');
    }
    if (respuesta.status === 422 || respuesta.status === 400) {
      throw new HttpError(400, detalle ?? 'El número de documento no es válido');
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new HttpError(
        503,
        'El servicio de consulta de documentos no está disponible (token inválido o vencido)',
      );
    }
    throw new HttpError(502, 'No se pudo consultar el documento, intente nuevamente');
  }

  const datos = (await respuesta.json()) as Record<string, unknown>;

  if (tipo === 'dni') {
    return {
      numeroDocumento: String(datos.document_number ?? numero),
      nombres: String(datos.first_name ?? ''),
      apellidoPaterno: (datos.first_last_name as string | undefined) ?? null,
      apellidoMaterno: (datos.second_last_name as string | undefined) ?? null,
    };
  }

  return {
    numeroDocumento: String(datos.numero_documento ?? numero),
    nombres: String(datos.razon_social ?? ''),
    apellidoPaterno: null,
    apellidoMaterno: null,
  };
}
