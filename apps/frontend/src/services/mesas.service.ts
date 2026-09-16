import { api } from './api';
import type { ApiSuccess, Mesa, MesaPublica } from '../types/api';

export interface CrearMesaInput {
  salonId: string;
  numero: string;
  capacidad: number;
}

export interface ActualizarMesaInput {
  salonId?: string;
  numero?: string;
  capacidad?: number;
  activo?: boolean;
}

export async function listarMesas() {
  const res = await api.get<ApiSuccess<Mesa[]>>('/api/mesas');
  return res.data.data;
}

export async function crearMesa(input: CrearMesaInput) {
  const res = await api.post<ApiSuccess<Mesa>>('/api/mesas', input);
  return res.data.data;
}

export async function actualizarMesa(id: string, input: ActualizarMesaInput) {
  const res = await api.put<ApiSuccess<Mesa>>(`/api/mesas/${id}`, input);
  return res.data.data;
}

export async function eliminarMesa(id: string) {
  await api.delete(`/api/mesas/${id}`);
}

/** Para confirmarle al visitante de la carta "vas a pedir para la Mesa 5" antes de armar su
 * pedido — sin autenticación, ver `carta-publica.routes.ts`. */
export async function obtenerMesaPublica(slug: string, mesaId: string) {
  const res = await api.get<ApiSuccess<MesaPublica>>(`/api/publico/${slug}/mesas/${mesaId}`);
  return res.data.data;
}
