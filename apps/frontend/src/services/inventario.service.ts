import { api } from './api';
import type { ApiSuccess, Existencia, StockItem, TipoMovimientoExistencia } from '../types/api';

export interface RegistrarMovimientoInventarioInput {
  almacenId: string;
  insumoId?: string;
  productoId?: string;
  tipo: Extract<
    TipoMovimientoExistencia,
    'inicial' | 'compra' | 'ajuste_entrada' | 'ajuste_salida'
  >;
  cantidad: number;
  costoUnitario?: number;
  observacion?: string;
}

export async function listarStock() {
  const res = await api.get<ApiSuccess<StockItem[]>>('/api/existencias/stock');
  return res.data.data;
}

export async function listarMovimientos(filtros?: {
  almacenId?: string;
  insumoId?: string;
  productoId?: string;
}) {
  const res = await api.get<ApiSuccess<Existencia[]>>('/api/existencias/movimientos', {
    params: filtros,
  });
  return res.data.data;
}

export async function registrarMovimiento(input: RegistrarMovimientoInventarioInput) {
  const res = await api.post<ApiSuccess<Existencia>>('/api/existencias/movimientos', input);
  return res.data.data;
}
