import { api } from './api';
import type { ApiSuccess, Turno } from '../types/api';

export interface AbrirTurnoInput {
  nota?: string;
}

export interface CerrarTurnoInput {
  nota?: string;
}

export async function listarTurnos() {
  const res = await api.get<ApiSuccess<Turno[]>>('/api/turnos');
  return res.data.data;
}

export async function obtenerMiTurno() {
  const res = await api.get<ApiSuccess<Turno | null>>('/api/turnos/mi-turno');
  return res.data.data;
}

export async function abrirTurno(input: AbrirTurnoInput) {
  const res = await api.post<ApiSuccess<Turno>>('/api/turnos/abrir', input);
  return res.data.data;
}

export async function cerrarTurno(id: string, input: CerrarTurnoInput) {
  const res = await api.post<ApiSuccess<Turno>>(`/api/turnos/${id}/cerrar`, input);
  return res.data.data;
}
