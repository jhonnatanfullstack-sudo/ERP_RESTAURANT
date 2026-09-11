import { api } from './api';
import type {
  ApiSuccess,
  Banco,
  MedioPago,
  TipoAfectacionIgv,
  TipoComprobante,
  TipoDocumentoIdentidad,
  TipoOperacion,
  UnidadMedida,
} from '../types/api';

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

export async function listarTiposComprobante() {
  const res = await api.get<ApiSuccess<TipoComprobante[]>>('/api/catalogos/tipos-comprobante');
  return res.data.data;
}

export async function listarTiposAfectacionIgv() {
  const res = await api.get<ApiSuccess<TipoAfectacionIgv[]>>('/api/catalogos/tipos-afectacion-igv');
  return res.data.data;
}

export async function listarTiposOperacion() {
  const res = await api.get<ApiSuccess<TipoOperacion[]>>('/api/catalogos/tipos-operacion');
  return res.data.data;
}

export async function listarMediosPago() {
  const res = await api.get<ApiSuccess<MedioPago[]>>('/api/catalogos/medios-pago');
  return res.data.data;
}

export async function listarBancos() {
  const res = await api.get<ApiSuccess<Banco[]>>('/api/catalogos/bancos');
  return res.data.data;
}
