import { api } from './api';
import type {
  AmbienteFacturacion,
  ApiSuccess,
  ComprobanteElectronico,
  ConfiguracionFacturacion,
  ProveedorOse,
} from '../types/api';

export interface GuardarConfiguracionFacturacionInput {
  oseProveedor?: ProveedorOse | null;
  oseUsuario?: string | null;
  /** Solo se manda cuando se quiere establecer/cambiar la credencial. */
  oseClave?: string;
  ambiente?: AmbienteFacturacion;
  activo?: boolean;
}

export async function obtenerConfiguracion() {
  const res = await api.get<ApiSuccess<ConfiguracionFacturacion>>('/api/facturacion/configuracion');
  return res.data.data;
}

export async function guardarConfiguracion(input: GuardarConfiguracionFacturacionInput) {
  const res = await api.put<ApiSuccess<ConfiguracionFacturacion>>(
    '/api/facturacion/configuracion',
    input,
  );
  return res.data.data;
}

export async function subirCertificado(archivo: File, contrasena: string) {
  const formData = new FormData();
  formData.append('certificado', archivo);
  formData.append('contrasena', contrasena);
  const res = await api.post<ApiSuccess<ConfiguracionFacturacion>>(
    '/api/facturacion/configuracion/certificado',
    formData,
  );
  return res.data.data;
}

export async function obtenerComprobanteDeVenta(ventaId: string) {
  const res = await api.get<ApiSuccess<ComprobanteElectronico | null>>(
    `/api/facturacion/ventas/${ventaId}`,
  );
  return res.data.data;
}

export async function emitirComprobante(ventaId: string) {
  const res = await api.post<ApiSuccess<ComprobanteElectronico>>(
    `/api/facturacion/ventas/${ventaId}/emitir`,
  );
  return res.data.data;
}

export async function reintentarEnvio(comprobanteId: string) {
  const res = await api.post<ApiSuccess<ComprobanteElectronico>>(
    `/api/facturacion/comprobantes/${comprobanteId}/reintentar`,
  );
  return res.data.data;
}
