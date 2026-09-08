import { api } from './api';
import type { ApiSuccess, Producto } from '../types/api';

export interface CrearProductoInput {
  categoriaId: string;
  marcaId?: string | null;
  unidadMedidaId: string;
  tipoAfectacionIgvId: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
}

export interface ActualizarProductoInput {
  categoriaId?: string;
  marcaId?: string | null;
  unidadMedidaId?: string;
  tipoAfectacionIgvId?: string;
  nombre?: string;
  descripcion?: string | null;
  precio?: number;
  activo?: boolean;
}

export async function listarProductos() {
  const res = await api.get<ApiSuccess<Producto[]>>('/api/productos');
  return res.data.data;
}

export async function listarProductosPublico() {
  const res = await api.get<ApiSuccess<Producto[]>>('/api/productos/publico');
  return res.data.data;
}

export async function crearProducto(input: CrearProductoInput) {
  const res = await api.post<ApiSuccess<Producto>>('/api/productos', input);
  return res.data.data;
}

export async function actualizarProducto(id: string, input: ActualizarProductoInput) {
  const res = await api.put<ApiSuccess<Producto>>(`/api/productos/${id}`, input);
  return res.data.data;
}

export async function eliminarProducto(id: string) {
  await api.delete(`/api/productos/${id}`);
}

export async function subirImagenProducto(id: string, archivo: File) {
  const formData = new FormData();
  formData.append('imagen', archivo);
  const res = await api.post<ApiSuccess<Producto>>(`/api/productos/${id}/imagen`, formData);
  return res.data.data;
}
