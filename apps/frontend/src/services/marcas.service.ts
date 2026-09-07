import { api } from './api';
import type { ApiSuccess, Marca } from '../types/api';

export interface CrearMarcaInput {
  nombre: string;
  descripcion?: string | null;
}

export interface ActualizarMarcaInput {
  nombre?: string;
  descripcion?: string | null;
  activo?: boolean;
}

export async function listarMarcas() {
  const res = await api.get<ApiSuccess<Marca[]>>('/api/marcas');
  return res.data.data;
}

export async function crearMarca(input: CrearMarcaInput) {
  const res = await api.post<ApiSuccess<Marca>>('/api/marcas', input);
  return res.data.data;
}

export async function actualizarMarca(id: string, input: ActualizarMarcaInput) {
  const res = await api.put<ApiSuccess<Marca>>(`/api/marcas/${id}`, input);
  return res.data.data;
}

export async function eliminarMarca(id: string) {
  await api.delete(`/api/marcas/${id}`);
}
