import { api } from './api';
import type { ApiSuccess, TipoDocumentoIdentidad } from '../types/api';

export async function listarTiposDocumentoIdentidad() {
  const res = await api.get<ApiSuccess<TipoDocumentoIdentidad[]>>(
    '/api/catalogos/tipos-documento-identidad',
  );
  return res.data.data;
}
