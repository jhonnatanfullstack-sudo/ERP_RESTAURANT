import { api } from './api';
import type {
  AccionEmpresa,
  ApiSuccess,
  PanelPlataforma,
  SolicitudSuscripcion,
  UsoDiario,
} from '../types/api';

/** Panel del proveedor del sistema. Solo responde a usuarios marcados como proveedor: a
 * cualquier otro le devuelve 404, así que la interfaz trata el error como "no disponible". */
export async function obtenerPanel() {
  const res = await api.get<ApiSuccess<PanelPlataforma>>('/api/plataforma/panel');
  return res.data.data;
}

export async function obtenerUsoDiario(empresaId: string) {
  const res = await api.get<ApiSuccess<UsoDiario[]>>(`/api/plataforma/empresas/${empresaId}/uso`);
  return res.data.data;
}

export async function aplicarAccion(empresaId: string, accion: AccionEmpresa) {
  const res = await api.post<ApiSuccess<unknown>>(
    `/api/plataforma/empresas/${empresaId}/acciones`,
    accion,
  );
  return res.data.data;
}

export async function listarSolicitudesPendientes() {
  const res = await api.get<ApiSuccess<SolicitudSuscripcion[]>>('/api/plataforma/solicitudes');
  return res.data.data;
}

export async function confirmarSolicitud(solicitudId: string) {
  const res = await api.post<ApiSuccess<SolicitudSuscripcion>>(
    `/api/plataforma/solicitudes/${solicitudId}/confirmar`,
  );
  return res.data.data;
}

export async function rechazarSolicitud(solicitudId: string) {
  const res = await api.post<ApiSuccess<SolicitudSuscripcion>>(
    `/api/plataforma/solicitudes/${solicitudId}/rechazar`,
  );
  return res.data.data;
}
