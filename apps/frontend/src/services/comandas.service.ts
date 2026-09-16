import { api } from './api';
import type { ApiSuccess, Comanda, EstadoComanda } from '../types/api';

export interface CrearComandaInput {
  pedidoId: string;
  detalleIds: string[];
  notas?: string | null;
}

/** `soloActivas` filtra en el servidor a pendiente/en_preparación/listo — lo que de verdad
 * necesita el tablero en vivo, que sondea este endpoint cada pocos segundos (ver
 * Cocina.tsx). Sin filtro trae también entregadas/canceladas, para la vista "Todas". */
export async function listarComandas(soloActivas = false) {
  const res = await api.get<ApiSuccess<Comanda[]>>('/api/comandas', {
    params: soloActivas ? { activas: 'true' } : undefined,
  });
  return res.data.data;
}

export async function obtenerComanda(id: string) {
  const res = await api.get<ApiSuccess<Comanda>>(`/api/comandas/${id}`);
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
