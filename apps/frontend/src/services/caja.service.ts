import { api } from './api';
import type { ApiSuccess, Caja, TipoMovimientoCaja } from '../types/api';

export interface AbrirCajaInput {
  montoApertura: number;
  observacion?: string;
}

export interface CerrarCajaInput {
  montoDeclarado: number;
  observacion?: string;
}

export interface RegistrarMovimientoInput {
  tipo: TipoMovimientoCaja;
  monto: number;
  concepto: string;
}

export async function listarCajas() {
  const res = await api.get<ApiSuccess<Caja[]>>('/api/cajas');
  return res.data.data;
}

export async function obtenerCajaActual() {
  const res = await api.get<ApiSuccess<Caja | null>>('/api/cajas/actual');
  return res.data.data;
}

export async function obtenerCaja(id: string) {
  const res = await api.get<ApiSuccess<Caja>>(`/api/cajas/${id}`);
  return res.data.data;
}

export async function abrirCaja(input: AbrirCajaInput) {
  const res = await api.post<ApiSuccess<Caja>>('/api/cajas/abrir', input);
  return res.data.data;
}

export async function cerrarCaja(id: string, input: CerrarCajaInput) {
  const res = await api.post<ApiSuccess<Caja>>(`/api/cajas/${id}/cerrar`, input);
  return res.data.data;
}

export async function registrarMovimiento(id: string, input: RegistrarMovimientoInput) {
  const res = await api.post<ApiSuccess<Caja>>(`/api/cajas/${id}/movimientos`, input);
  return res.data.data;
}
