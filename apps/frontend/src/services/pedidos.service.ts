import { api } from './api';
import type {
  ApiSuccess,
  CanalOrigenPedido,
  DetallePedido,
  EstadoPedido,
  MedioPagoPreferido,
  Pedido,
} from '../types/api';

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

export interface LineaPedidoPublicoInput {
  productoId: string;
  cantidad: number;
  notas?: string;
}

export interface CrearPedidoPublicoInput {
  canalOrigen: Exclude<CanalOrigenPedido, 'salon'>;
  mesaId?: string;
  contactoNombre?: string;
  contactoTelefono?: string;
  direccionEntrega?: string;
  medioPagoPreferido?: MedioPagoPreferido;
  vueltoPara?: number;
  notas?: string;
  detalles: LineaPedidoPublicoInput[];
}

/** Pedido que arma el propio cliente desde la carta pública (autopedido en mesa, delivery o
 * recojo), sin autenticarse — ver `carta-publica.routes.ts`. */
export async function crearPedidoPublico(slug: string, input: CrearPedidoPublicoInput) {
  const res = await api.post<ApiSuccess<Pedido>>(`/api/publico/${slug}/pedidos`, input);
  return res.data.data;
}
