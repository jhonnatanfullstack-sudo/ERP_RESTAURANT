import { api } from './api';
import type { ApiSuccess, EstadoVenta, FormaPago, Venta } from '../types/api';

export interface LineaVentaInput {
  productoId: string;
  cantidad: number;
}

export interface CrearVentaInput {
  /** Venta a partir de un pedido cerrado. Excluyente con `detalles` — ver `venta.dto.ts`. */
  pedidoId?: string;
  /** Venta directa: lista de productos, sin pedido de origen. Excluyente con `pedidoId`. */
  detalles?: LineaVentaInput[];
  tipoComprobanteId: string;
  clienteId?: string;
  formaPago?: FormaPago;
  medioPagoId?: string;
}

export async function listarVentas(estado?: EstadoVenta) {
  const res = await api.get<ApiSuccess<Venta[]>>('/api/ventas', { params: { estado } });
  return res.data.data;
}

export async function obtenerVenta(id: string) {
  const res = await api.get<ApiSuccess<Venta>>(`/api/ventas/${id}`);
  return res.data.data;
}

export async function crearVenta(input: CrearVentaInput) {
  const res = await api.post<ApiSuccess<Venta>>('/api/ventas', input);
  return res.data.data;
}

export async function anularVenta(id: string) {
  await api.delete(`/api/ventas/${id}`);
}
