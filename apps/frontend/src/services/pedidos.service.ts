import { api } from './api';
import type { ApiSuccess, DetallePedido, EstadoPedido, Pedido } from '../types/api';

export interface CrearPedidoInput {
  /** Sin mesaId el pedido es "para llevar". */
  mesaId?: string;
  clienteId?: string;
  notas?: string | null;
}

export interface ActualizarPedidoInput {
  estado?: EstadoPedido;
  notas?: string | null;
}

export interface AgregarDetalleInput {
  productoId: string;
  cantidad: number;
  notas?: string | null;
}

export interface ActualizarDetalleInput {
  cantidad?: number;
  notas?: string | null;
}

export async function listarPedidos() {
  const res = await api.get<ApiSuccess<Pedido[]>>('/api/pedidos');
  return res.data.data;
}

export async function obtenerPedido(id: string) {
  const res = await api.get<ApiSuccess<Pedido>>(`/api/pedidos/${id}`);
  return res.data.data;
}

export async function crearPedido(input: CrearPedidoInput) {
  const res = await api.post<ApiSuccess<Pedido>>('/api/pedidos', input);
  return res.data.data;
}

export async function actualizarPedido(id: string, input: ActualizarPedidoInput) {
  const res = await api.put<ApiSuccess<Pedido>>(`/api/pedidos/${id}`, input);
  return res.data.data;
}

export async function cancelarPedido(id: string) {
  await api.delete(`/api/pedidos/${id}`);
}

export async function agregarDetalle(pedidoId: string, input: AgregarDetalleInput) {
  const res = await api.post<ApiSuccess<DetallePedido>>(`/api/pedidos/${pedidoId}/detalles`, input);
  return res.data.data;
}

export async function actualizarDetalle(
  pedidoId: string,
  detalleId: string,
  input: ActualizarDetalleInput,
) {
  const res = await api.put<ApiSuccess<DetallePedido>>(
    `/api/pedidos/${pedidoId}/detalles/${detalleId}`,
    input,
  );
  return res.data.data;
}

export async function eliminarDetalle(pedidoId: string, detalleId: string) {
  await api.delete(`/api/pedidos/${pedidoId}/detalles/${detalleId}`);
}
