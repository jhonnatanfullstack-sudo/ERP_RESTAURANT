import { api } from './api';
import type { ApiSuccess, CosteoProducto, ResumenCosteo } from '../types/api';

export async function obtenerCosteo() {
  const res = await api.get<ApiSuccess<ResumenCosteo>>('/api/costeo');
  return res.data.data;
}

export async function obtenerCosteoDeProducto(productoId: string) {
  const res = await api.get<ApiSuccess<CosteoProducto>>(`/api/costeo/${productoId}`);
  return res.data.data;
}
