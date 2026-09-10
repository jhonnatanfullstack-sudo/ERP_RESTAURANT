import { env } from '../../config/env';
import { HttpError } from '../../utils/http-error';

export interface DatosDocumento {
  numeroDocumento: string;
  /** null cuando es un RUC de persona jurídica (empieza en "20") — en ese caso el
   * nombre viene en razonSocial. */
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  /** Solo para RUC de persona jurídica (empieza en "20"); null en cualquier otro caso. */
  razonSocial: string | null;
  /** Domicilio fiscal. SUNAT lo devuelve para RUC; RENIEC no lo entrega en el
   * plan de consulta por DNI, así que ahí llega null. */
  direccion: string | null;
}

const PREFIJO_RUC_PERSONA_JURIDICA = '20';
/** RUC de persona natural (con negocio): "10" + su DNI (8 dígitos) + 1 dígito verificador —
 * formato fijo de SUNAT. Se aprovecha para extraer el DNI y consultar RENIEC, que sí separa
 * nombres/apellidos (SUNAT solo devuelve un string combinado en `razon_social`, incluso para
 * este tipo de RUC). Ver `consultarDocumento`. */
const PREFIJO_RUC_PERSONA_NATURAL = '10';

/** El proveedor devuelve campos ausentes como null, cadena vacía o "-": todos
 * significan "sin dato" y deben guardarse como null, no como texto basura. */
function textoOpcional(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' || limpio === '-' ? null : limpio;
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
      razonSocial: null,
      // El proveedor solo incluye dirección en algunos planes; si no viene, null.
      direccion: textoOpcional(datos.direccion ?? datos.address),
    };
  }

  const numeroDocumento = String(datos.numero_documento ?? numero);
  const razonSocial = String(datos.razon_social ?? '');
  // `direccion_completa` incluye distrito/provincia/departamento; `direccion` es solo la vía.
  // Se prefiere la completa cuando el proveedor la entrega.
  const direccion = textoOpcional(datos.direccion_completa ?? datos.direccion);
  // RUC que empieza en "20" = persona jurídica (empresa): SUNAT no le asocia
  // nombres/apellidos, solo razón social.
  const esPersonaJuridica = numeroDocumento.startsWith(PREFIJO_RUC_PERSONA_JURIDICA);

  if (esPersonaJuridica) {
    return {
      numeroDocumento,
      nombres: null,
      apellidoPaterno: null,
      apellidoMaterno: null,
      razonSocial,
      direccion,
    };
  }

  // Persona natural (RUC "10"/"15"/"17"...). SUNAT solo devuelve el nombre completo como una
  // sola cadena en `razon_social`. Para el caso más común, RUC "10", el propio número contiene
  // el DNI de esa persona: se extrae y se consulta RENIEC, que sí separa nombres/apellidos —
  // mucho mejor que adivinar dónde cortar la cadena de SUNAT. Si esa consulta falla por
  // cualquier motivo (DNI no hallado, servicio caído), se sigue con el string combinado.
  if (numeroDocumento.startsWith(PREFIJO_RUC_PERSONA_NATURAL) && numeroDocumento.length === 11) {
    const dni = numeroDocumento.slice(2, 10);
    try {
      const datosDni = await consultarDocumento('dni', dni);
      return {
        numeroDocumento,
        nombres: datosDni.nombres,
        apellidoPaterno: datosDni.apellidoPaterno,
        apellidoMaterno: datosDni.apellidoMaterno,
        razonSocial: null,
        direccion,
      };
    } catch {
      // Cae al string combinado de abajo.
    }
  }

  return {
    numeroDocumento,
    nombres: razonSocial || null,
    apellidoPaterno: null,
    apellidoMaterno: null,
    razonSocial: null,
    direccion,
  };
}
