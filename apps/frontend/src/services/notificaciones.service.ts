import { api } from './api';
import type { ApiSuccess, Notificacion } from '../types/api';

export async function listarNotificaciones() {
  const res = await api.get<ApiSuccess<Notificacion[]>>('/api/notificaciones');
  return res.data.data;
}

export async function contarNoLeidas() {
  const res = await api.get<ApiSuccess<{ noLeidas: number }>>('/api/notificaciones/no-leidas');
  return res.data.data.noLeidas;
}

export async function marcarLeida(id: string) {
  const res = await api.post<ApiSuccess<Notificacion>>(`/api/notificaciones/${id}/leer`);
  return res.data.data;
}

export async function marcarTodasLeidas() {
  await api.post('/api/notificaciones/leer-todas');
}
