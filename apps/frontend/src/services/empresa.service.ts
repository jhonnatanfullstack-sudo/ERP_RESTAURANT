import { api } from './api';
import type { ApiSuccess, Empresa, EmpresaPublica } from '../types/api';

export interface ActualizarEmpresaInput {
  razonSocial?: string;
  nombreComercial?: string | null;
  direccionFiscal?: string | null;
  telefono?: string | null;
  email?: string | null;
  ubigeo?: string | null;
  paisId?: string | null;
  distritoId?: string | null;
  logo?: string | null;
  acogidoRegimenMypeRestaurantes?: boolean;
}

export async function listarEmpresas() {
  const res = await api.get<ApiSuccess<Empresa[]>>('/api/empresas');
  return res.data.data;
}

/** Sin autenticación — usado por la carta pública para mostrar el nombre, dirección,
 * teléfono y logo reales del restaurante en vez de un branding genérico.
 *
 * Lleva el slug del restaurante porque con varias empresas en el sistema ya no existe "la"
 * empresa pública: cada una publica su propia carta en `/carta/:slug`. */
export async function obtenerEmpresaPublica(slug: string) {
  const res = await api.get<ApiSuccess<EmpresaPublica | null>>(`/api/publico/${slug}/empresa`);
  return res.data.data;
}

export async function actualizarEmpresa(id: string, input: ActualizarEmpresaInput) {
  const res = await api.put<ApiSuccess<Empresa>>(`/api/empresas/${id}`, input);
  return res.data.data;
}
