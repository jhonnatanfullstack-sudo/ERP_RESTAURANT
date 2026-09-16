import { api } from './api';
import type { ApiSuccess, EmpresaReclamaciones, Reclamacion, TipoReclamacion } from '../types/api';

export interface CrearReclamacionPublicaInput {
  tipo: TipoReclamacion;
  consumidorNombres: string;
  consumidorApellidos: string;
  tipoDocumentoIdentidadId: string;
  consumidorNumeroDocumento: string;
  consumidorDomicilio: string;
  consumidorEmail: string;
  consumidorTelefono?: string;
  esMenorEdad?: boolean;
  apoderadoNombre?: string;
  apoderadoNumeroDocumento?: string;
  descripcionBien: string;
  montoReclamado?: number;
  detalle: string;
  pedido: string;
}

/** Datos del proveedor para la cabecera del formulario — sin autenticación. */
export async function obtenerEmpresaParaReclamaciones(slug: string) {
  const res = await api.get<ApiSuccess<EmpresaReclamaciones | null>>(
    `/api/publico/${slug}/reclamaciones/empresa`,
  );
  return res.data.data;
}

/** Alta de un reclamo/queja en el Libro de Reclamaciones Virtual, sin autenticarse — el
 * reglamento prohíbe exigir que el consumidor sea cliente registrado. */
export async function crearReclamacionPublica(slug: string, input: CrearReclamacionPublicaInput) {
  const res = await api.post<ApiSuccess<Reclamacion>>(`/api/publico/${slug}/reclamaciones`, input);
  return res.data.data;
}

/** A partir de acá, endpoints autenticados para el staff (`/api/reclamaciones`). */
export async function listarReclamaciones() {
  const res = await api.get<ApiSuccess<Reclamacion[]>>('/api/reclamaciones');
  return res.data.data;
}

export async function obtenerReclamacion(id: string) {
  const res = await api.get<ApiSuccess<Reclamacion>>(`/api/reclamaciones/${id}`);
  return res.data.data;
}

export async function responderReclamacion(id: string, respuestaProveedor: string) {
  const res = await api.post<ApiSuccess<Reclamacion>>(`/api/reclamaciones/${id}/responder`, {
    respuestaProveedor,
  });
  return res.data.data;
}
