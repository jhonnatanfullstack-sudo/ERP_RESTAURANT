import { api } from './api';
import type { ApiSuccess, ResumenSuscripcion } from '../types/api';

export async function obtenerSuscripcion() {
  const res = await api.get<ApiSuccess<ResumenSuscripcion>>('/api/suscripcion');
  return res.data.data;
}
