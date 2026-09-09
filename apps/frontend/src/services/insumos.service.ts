import { api } from './api';
import type { ApiSuccess, Insumo } from '../types/api';

export interface CrearInsumoInput {
  nombre: string;
  descripcion?: string | null;
  unidadMedidaId: string;
  tipoAfectacionIgvId: string;
}

export interface ActualizarInsumoInput {
  nombre?: string;
  descripcion?: string | null;
  unidadMedidaId?: string;
  tipoAfectacionIgvId?: string;
  activo?: boolean;
}

export async function listarInsumos() {
  const res = await api.get<ApiSuccess<Insumo[]>>('/api/insumos');
  return res.data.data;
}

export async function crearInsumo(input: CrearInsumoInput) {
  const res = await api.post<ApiSuccess<Insumo>>('/api/insumos', input);
  return res.data.data;
}

export async function actualizarInsumo(id: string, input: ActualizarInsumoInput) {
  const res = await api.put<ApiSuccess<Insumo>>(`/api/insumos/${id}`, input);
  return res.data.data;
}

export async function eliminarInsumo(id: string) {
  await api.delete(`/api/insumos/${id}`);
}
