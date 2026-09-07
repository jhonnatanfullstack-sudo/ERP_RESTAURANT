import { api } from './api';
import type { ApiSuccess, Empresa } from '../types/api';

export interface ActualizarEmpresaInput {
  razonSocial?: string;
  nombreComercial?: string | null;
  direccionFiscal?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export async function listarEmpresas() {
  const res = await api.get<ApiSuccess<Empresa[]>>('/api/empresas');
  return res.data.data;
}

export async function actualizarEmpresa(id: string, input: ActualizarEmpresaInput) {
  const res = await api.put<ApiSuccess<Empresa>>(`/api/empresas/${id}`, input);
  return res.data.data;
}
