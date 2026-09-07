import { api } from './api';
import type { ApiSuccess, Categoria } from '../types/api';

export interface CrearCategoriaInput {
  nombre: string;
  descripcion?: string | null;
}

export interface ActualizarCategoriaInput {
  nombre?: string;
  descripcion?: string | null;
  activo?: boolean;
}

export async function listarCategorias() {
  const res = await api.get<ApiSuccess<Categoria[]>>('/api/categorias');
  return res.data.data;
}

export async function crearCategoria(input: CrearCategoriaInput) {
  const res = await api.post<ApiSuccess<Categoria>>('/api/categorias', input);
  return res.data.data;
}

export async function actualizarCategoria(id: string, input: ActualizarCategoriaInput) {
  const res = await api.put<ApiSuccess<Categoria>>(`/api/categorias/${id}`, input);
  return res.data.data;
}

export async function eliminarCategoria(id: string) {
  await api.delete(`/api/categorias/${id}`);
}
