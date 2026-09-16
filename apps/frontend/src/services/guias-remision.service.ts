import { api } from './api';
import type { ApiSuccess, GuiaRemision } from '../types/api';

export interface LineaGuiaRemisionInput {
  descripcion: string;
  cantidad: number;
  unidadMedidaId: string;
}

export interface CrearGuiaRemisionInput {
  talonarioId?: string;
  ventaId?: string;
  motivoTrasladoId: string;
  modalidadTrasladoId: string;
  fechaTraslado: string;
  pesoTotalKg: number;
  numeroBultos?: number;
  partidaDireccion: string;
  partidaUbigeo?: string;
  llegadaDireccion: string;
  llegadaUbigeo?: string;
  destinatarioNumeroDocumento?: string;
  destinatarioNombre?: string;
  transportistaPlaca?: string;
  transportistaLicencia?: string;
  transportistaRuc?: string;
  transportistaRazonSocial?: string;
  observacion?: string;
  detalles: LineaGuiaRemisionInput[];
}

export async function listarGuiasRemision() {
  const res = await api.get<ApiSuccess<GuiaRemision[]>>('/api/guias-remision');
  return res.data.data;
}

export async function obtenerGuiaRemision(id: string) {
  const res = await api.get<ApiSuccess<GuiaRemision>>(`/api/guias-remision/${id}`);
  return res.data.data;
}

export async function crearGuiaRemision(input: CrearGuiaRemisionInput) {
  const res = await api.post<ApiSuccess<GuiaRemision>>('/api/guias-remision', input);
  return res.data.data;
}

export async function emitirGuiaRemision(id: string) {
  const res = await api.post<ApiSuccess<GuiaRemision>>(`/api/guias-remision/${id}/emitir`);
  return res.data.data;
}

export async function reintentarEnvioGuiaRemision(id: string) {
  const res = await api.post<ApiSuccess<GuiaRemision>>(`/api/guias-remision/${id}/reintentar`);
  return res.data.data;
}
