import { api } from './api';
import type { ApiSuccess, InformacionDemo, SesionDemo, TipoDocumentoIdentidad } from '../types/api';

export interface RegistrarDemoInput {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  direccionFiscal?: string;
  telefono?: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno?: string;
  tipoDocumentoIdentidadId: string;
  numeroDocumento: string;
  email: string;
  password: string;
}

/** Sin autenticación: es la puerta de entrada de quien todavía no tiene cuenta. */
export async function obtenerInformacionDemo() {
  const res = await api.get<ApiSuccess<InformacionDemo>>('/api/demo/informacion');
  return res.data.data;
}

/** El catálogo general exige sesión; quien se registra todavía no tiene ninguna. */
export async function listarTiposDocumentoPublico() {
  const res = await api.get<ApiSuccess<TipoDocumentoIdentidad[]>>('/api/demo/tipos-documento');
  return res.data.data;
}

export async function registrarDemo(input: RegistrarDemoInput) {
  const res = await api.post<ApiSuccess<SesionDemo>>('/api/demo/registrar', input);
  return res.data.data;
}
