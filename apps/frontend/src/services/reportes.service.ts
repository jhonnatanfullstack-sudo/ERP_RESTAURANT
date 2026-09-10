import { api } from './api';
import type { ApiSuccess, Reporte } from '../types/api';

/** Rango inclusivo en formato 'YYYY-MM-DD'. */
export interface RangoReporte {
  desde: string;
  hasta: string;
}

export async function obtenerReporte(rango: RangoReporte) {
  const res = await api.get<ApiSuccess<Reporte>>('/api/reportes', { params: rango });
  return res.data.data;
}
