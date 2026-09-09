import { api } from './api';
import type { ApiSuccess, Almacen } from '../types/api';

export interface CrearAlmacenInput {
  empresaId: string;
  nombre: string;
  direccion?: string | null;
  esPrincipal?: boolean;
}

export interface ActualizarAlmacenInput {
  nombre?: string;
  direccion?: string | null;
  esPrincipal?: boolean;
  activo?: boolean;
}

export async function listarAlmacenes() {
  const res = await api.get<ApiSuccess<Almacen[]>>('/api/almacenes');
  return res.data.data;
}

export async function crearAlmacen(input: CrearAlmacenInput) {
  const res = await api.post<ApiSuccess<Almacen>>('/api/almacenes', input);
  return res.data.data;
}

export async function actualizarAlmacen(id: string, input: ActualizarAlmacenInput) {
  const res = await api.put<ApiSuccess<Almacen>>(`/api/almacenes/${id}`, input);
  return res.data.data;
}

export async function eliminarAlmacen(id: string) {
  await api.delete(`/api/almacenes/${id}`);
}
