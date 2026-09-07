import { api } from './api';
import type { ApiSuccess, Salon } from '../types/api';

export interface CrearSalonInput {
  nombre: string;
  descripcion?: string | null;
}

export interface ActualizarSalonInput {
  nombre?: string;
  descripcion?: string | null;
  activo?: boolean;
}

export async function listarSalones() {
  const res = await api.get<ApiSuccess<Salon[]>>('/api/salones');
  return res.data.data;
}

export async function crearSalon(input: CrearSalonInput) {
  const res = await api.post<ApiSuccess<Salon>>('/api/salones', input);
  return res.data.data;
}

export async function actualizarSalon(id: string, input: ActualizarSalonInput) {
  const res = await api.put<ApiSuccess<Salon>>(`/api/salones/${id}`, input);
  return res.data.data;
}

export async function eliminarSalon(id: string) {
  await api.delete(`/api/salones/${id}`);
}
