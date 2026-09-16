import { api } from './api';
import type {
  ApiSuccess,
  Banco,
  DivisionAdministrativa,
  MedioPago,
  ModalidadTraslado,
  MotivoNota,
  MotivoTraslado,
  Pais,
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

export async function listarPaises() {
  const res = await api.get<ApiSuccess<Pais[]>>('/api/catalogos/paises');
  return res.data.data;
}

/** `padreId` ausente trae el primer nivel (departamentos) de `paisId`; con un id trae los
 * hijos directos de esa división (provincias de un departamento, distritos de una provincia). */
export async function listarDivisionesAdministrativas(paisId: string, padreId?: string | null) {
  const res = await api.get<ApiSuccess<DivisionAdministrativa[]>>(
    '/api/catalogos/divisiones-administrativas',
    { params: { paisId, padreId: padreId ?? undefined } },
  );
  return res.data.data;
}

export async function listarMotivosTraslado() {
  const res = await api.get<ApiSuccess<MotivoTraslado[]>>('/api/catalogos/motivos-traslado');
  return res.data.data;
}

export async function listarModalidadesTraslado() {
  const res = await api.get<ApiSuccess<ModalidadTraslado[]>>(
    '/api/catalogos/modalidades-traslado',
  );
  return res.data.data;
}

/** `tipoDocumento`: '07' trae los motivos de Nota de Crédito, '08' los de Nota de Débito. */
export async function listarMotivosNota(tipoDocumento: '07' | '08') {
  const res = await api.get<ApiSuccess<MotivoNota[]>>('/api/catalogos/motivos-nota', {
    params: { tipoDocumento },
  });
  return res.data.data;
}
