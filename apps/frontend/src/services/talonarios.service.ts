import { api } from './api';
import type { ApiSuccess, Talonario } from '../types/api';

export interface CrearTalonarioInput {
  empresaId: string;
  tipoComprobanteId: string;
  almacenId: string;
  serie: string;
  numeroInicio: number;
  numeroFin: number;
  numeroActual?: number;
  usuarioIds?: string[];
}

export interface ActualizarTalonarioInput {
  almacenId?: string;
  serie?: string;
  numeroInicio?: number;
  numeroFin?: number;
  numeroActual?: number;
  activo?: boolean;
}

export async function listarTalonarios() {
  const res = await api.get<ApiSuccess<Talonario[]>>('/api/talonarios');
  return res.data.data;
}

/** Talonarios que el usuario autenticado puede usar para emitir. Alimenta el selector de
 * Ventas: solo trae los suyos, activos y no agotados. */
export async function listarMisTalonarios(tipoComprobanteId?: string) {
  const res = await api.get<ApiSuccess<Talonario[]>>('/api/talonarios/mios', {
    params: { tipoComprobanteId },
  });
  return res.data.data;
}

export async function crearTalonario(input: CrearTalonarioInput) {
  const res = await api.post<ApiSuccess<Talonario>>('/api/talonarios', input);
  return res.data.data;
}

export async function actualizarTalonario(id: string, input: ActualizarTalonarioInput) {
  const res = await api.put<ApiSuccess<Talonario>>(`/api/talonarios/${id}`, input);
  return res.data.data;
}

export async function asignarUsuarios(id: string, usuarioIds: string[]) {
  const res = await api.put<ApiSuccess<Talonario>>(`/api/talonarios/${id}/usuarios`, {
    usuarioIds,
  });
  return res.data.data;
}

export async function eliminarTalonario(id: string) {
  await api.delete(`/api/talonarios/${id}`);
}
