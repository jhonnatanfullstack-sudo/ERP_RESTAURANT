import { api } from './api';
import type { ApiSuccess, Cliente, MovimientoFidelizacion } from '../types/api';

export interface SaldoCliente {
  cliente: Cliente;
  saldo: number;
}

export interface DetalleFidelizacionCliente {
  saldo: number;
  movimientos: MovimientoFidelizacion[];
}

export interface CanjearPuntosInput {
  clienteId: string;
  puntos: number;
  ventaId?: string;
  observacion?: string;
}

export interface AjustarPuntosInput {
  clienteId: string;
  puntos: number;
  observacion: string;
}

export async function listarClientesConPuntos() {
  const res = await api.get<ApiSuccess<SaldoCliente[]>>('/api/fidelizacion/clientes');
  return res.data.data;
}

export async function obtenerDetalleCliente(clienteId: string) {
  const res = await api.get<ApiSuccess<DetalleFidelizacionCliente>>(
    `/api/fidelizacion/clientes/${clienteId}`,
  );
  return res.data.data;
}

export async function canjearPuntos(input: CanjearPuntosInput) {
  const res = await api.post<ApiSuccess<MovimientoFidelizacion>>(
    '/api/fidelizacion/canjear',
    input,
  );
  return res.data.data;
}

export async function ajustarPuntos(input: AjustarPuntosInput) {
  const res = await api.post<ApiSuccess<MovimientoFidelizacion>>(
    '/api/fidelizacion/ajustar',
    input,
  );
  return res.data.data;
}
