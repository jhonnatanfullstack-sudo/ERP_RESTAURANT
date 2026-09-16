import { api } from './api';
import type {
  ApiSuccess,
  CicloFacturacion,
  PlanContratado,
  PlanPublico,
  ResumenSuscripcion,
  SolicitudSuscripcion,
} from '../types/api';

export async function obtenerSuscripcion() {
  const res = await api.get<ApiSuccess<ResumenSuscripcion>>('/api/suscripcion');
  return res.data.data;
}

/** Público — sin sesión, lo consume la página de precios. */
export async function obtenerPlanes() {
  const res = await api.get<ApiSuccess<PlanPublico[]>>('/api/suscripcion/planes');
  return res.data.data;
}

export async function solicitarSuscripcion(input: {
  plan: PlanContratado;
  ciclo: CicloFacturacion;
  mensajeContacto?: string;
}) {
  const res = await api.post<ApiSuccess<SolicitudSuscripcion>>('/api/suscripcion/solicitar', input);
  return res.data.data;
}

export async function listarMisSolicitudes() {
  const res = await api.get<ApiSuccess<SolicitudSuscripcion[]>>('/api/suscripcion/solicitudes');
  return res.data.data;
}
