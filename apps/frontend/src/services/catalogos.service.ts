import { api } from './api';
import type { ApiSuccess, TipoDocumentoIdentidad, UnidadMedida } from '../types/api';

export async function listarTiposDocumentoIdentidad() {
  const res = await api.get<ApiSuccess<TipoDocumentoIdentidad[]>>(
    '/api/catalogos/tipos-documento-identidad',
  );
  return res.data.data;
}

export async function listarUnidadesMedida() {
  const res = await api.get<ApiSuccess<UnidadMedida[]>>('/api/catalogos/unidades-medida');
  return res.data.data;
}
