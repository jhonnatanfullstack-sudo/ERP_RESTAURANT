import { api } from './api';
import type {
  ApiSuccess,
  DivisionAdministrativa,
  InformacionDemo,
  Pais,
  SesionDemo,
  TipoDocumentoIdentidad,
} from '../types/api';

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
  paisId?: string;
  distritoId?: string;
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

export async function listarPaisesPublico() {
  const res = await api.get<ApiSuccess<Pais[]>>('/api/demo/paises');
  return res.data.data;
}

export async function listarDivisionesAdministrativasPublico(
  paisId: string,
  padreId?: string | null,
) {
  const res = await api.get<ApiSuccess<DivisionAdministrativa[]>>(
    '/api/demo/divisiones-administrativas',
    { params: { paisId, padreId: padreId ?? undefined } },
  );
  return res.data.data;
}

export async function registrarDemo(input: RegistrarDemoInput) {
  const res = await api.post<ApiSuccess<SesionDemo>>('/api/demo/registrar', input);
  return res.data.data;
}
