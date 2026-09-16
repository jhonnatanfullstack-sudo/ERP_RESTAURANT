import { api } from './api';
import type { ApiSuccess, NotaVenta } from '../types/api';

export interface CrearNotaCreditoInput {
  ventaId: string;
  talonarioId: string;
  motivoId: string;
  descripcionSustento?: string;
}

export interface CrearNotaDebitoInput {
  ventaId: string;
  talonarioId: string;
  motivoId: string;
  descripcionSustento?: string;
  concepto: string;
  monto: number;
}

export async function listarNotasVenta() {
  const res = await api.get<ApiSuccess<NotaVenta[]>>('/api/notas-venta');
  return res.data.data;
}

export async function listarNotasDeVenta(ventaId: string) {
  const res = await api.get<ApiSuccess<NotaVenta[]>>(`/api/notas-venta/de-venta/${ventaId}`);
  return res.data.data;
}

export async function obtenerNotaVenta(id: string) {
  const res = await api.get<ApiSuccess<NotaVenta>>(`/api/notas-venta/${id}`);
  return res.data.data;
}

export async function crearNotaCredito(input: CrearNotaCreditoInput) {
  const res = await api.post<ApiSuccess<NotaVenta>>('/api/notas-venta/credito', input);
  return res.data.data;
}

export async function crearNotaDebito(input: CrearNotaDebitoInput) {
  const res = await api.post<ApiSuccess<NotaVenta>>('/api/notas-venta/debito', input);
  return res.data.data;
}

export async function emitirNota(id: string) {
  const res = await api.post<ApiSuccess<NotaVenta>>(`/api/notas-venta/${id}/emitir`);
  return res.data.data;
}

export async function reintentarEnvioNota(id: string) {
  const res = await api.post<ApiSuccess<NotaVenta>>(`/api/notas-venta/${id}/reintentar`);
  return res.data.data;
}
