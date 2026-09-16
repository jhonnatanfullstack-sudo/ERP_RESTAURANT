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

/** QR estático de cobro que la propia app de Yape/Plin le muestra al restaurante — se exhibe
 * en caja al cobrar con ese medio de pago. */
export async function subirQrPago(medio: 'yape' | 'plin', archivo: File) {
  const formData = new FormData();
  formData.append('qr', archivo);
  const res = await api.post<ApiSuccess<ConfiguracionRestaurante>>(
    `/api/configuracion/qr-pago/${medio}`,
    formData,
  );
  return res.data.data;
}
