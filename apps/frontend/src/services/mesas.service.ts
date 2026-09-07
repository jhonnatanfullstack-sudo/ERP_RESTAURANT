import { api } from './api';
import type { ApiSuccess, Mesa } from '../types/api';

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
