import { api } from './api';
import type { ApiSuccess, Producto, RecetaInsumo, TipoProducto } from '../types/api';

export interface LineaRecetaInput {
  insumoId: string;
  cantidad: number;
}

export interface CrearProductoInput {
  categoriaId: string;
  marcaId?: string | null;
  unidadMedidaId: string;
  tipoAfectacionIgvId: string;
  tipo?: TipoProducto;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  /** Solo aplica si `tipo = 'servicio'`; se ignora para `mercaderia`. */
  receta?: LineaRecetaInput[];
}

export interface ActualizarProductoInput {
  categoriaId?: string;
  marcaId?: string | null;
  unidadMedidaId?: string;
  tipoAfectacionIgvId?: string;
  tipo?: TipoProducto;
  nombre?: string;
  descripcion?: string | null;
  precio?: number;
  activo?: boolean;
  receta?: LineaRecetaInput[];
}

export async function listarProductos() {
  const res = await api.get<ApiSuccess<Producto[]>>('/api/productos');
  return res.data.data;
}

export async function listarProductosPublico(slug: string) {
  const res = await api.get<ApiSuccess<Producto[]>>(`/api/publico/${slug}/productos`);
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

export async function obtenerRecetaProducto(productoId: string) {
  const res = await api.get<ApiSuccess<RecetaInsumo[]>>(`/api/recetas/${productoId}`);
  return res.data.data;
}

export async function reemplazarRecetaProducto(productoId: string, lineas: LineaRecetaInput[]) {
  const res = await api.put<ApiSuccess<RecetaInsumo[]>>(`/api/recetas/${productoId}`, { lineas });
  return res.data.data;
}
