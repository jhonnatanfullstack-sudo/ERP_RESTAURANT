import { api } from './api';
import type { ApiSuccess, ConfiguracionRestaurante } from '../types/api';

export async function obtenerConfiguracion() {
  const res = await api.get<ApiSuccess<ConfiguracionRestaurante>>('/api/configuracion');
  return res.data.data;
}

export async function actualizarConfiguracion(input: Partial<ConfiguracionRestaurante>) {
  const res = await api.put<ApiSuccess<ConfiguracionRestaurante>>('/api/configuracion', input);
  return res.data.data;
}
