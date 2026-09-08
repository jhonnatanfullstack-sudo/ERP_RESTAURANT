import { api } from './api';
import type { ApiSuccess, Comanda, EstadoComanda } from '../types/api';

export interface CrearComandaInput {
  pedidoId: string;
  detalleIds: string[];
  notas?: string | null;
}

export async function listarComandas() {
  const res = await api.get<ApiSuccess<Comanda[]>>('/api/comandas');
  return res.data.data;
}

export async function crearComanda(input: CrearComandaInput) {
  const res = await api.post<ApiSuccess<Comanda>>('/api/comandas', input);
  return res.data.data;
}

export async function actualizarEstadoComanda(id: string, estado: EstadoComanda) {
  const res = await api.put<ApiSuccess<Comanda>>(`/api/comandas/${id}`, { estado });
  return res.data.data;
}

export async function cancelarComanda(id: string) {
  await api.delete(`/api/comandas/${id}`);
}
