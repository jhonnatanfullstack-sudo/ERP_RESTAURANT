import { api } from './api';
import type { AccionAuditoria, ApiSuccess, PaginaAuditoria } from '../types/api';

export interface FiltrosAuditoria {
  usuarioId?: string;
  modulo?: string;
  accion?: AccionAuditoria;
  desde?: string;
  hasta?: string;
  pagina?: number;
  porPagina?: number;
}

export async function listarAuditoria(filtros: FiltrosAuditoria) {
  const res = await api.get<ApiSuccess<PaginaAuditoria>>('/api/auditoria', { params: filtros });
  return res.data.data;
}

export async function listarModulosAuditados() {
  const res = await api.get<ApiSuccess<string[]>>('/api/auditoria/modulos');
  return res.data.data;
}
