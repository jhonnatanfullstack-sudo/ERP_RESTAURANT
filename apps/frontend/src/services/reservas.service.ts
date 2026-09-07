import { api } from './api';
import type { ApiSuccess, EstadoReserva, Reserva } from '../types/api';

export interface CrearReservaInput {
  clienteId: string;
  mesaId: string;
  fechaHora: string;
  duracionMinutos?: number;
  cantidadPersonas: number;
  notas?: string | null;
}

export interface ActualizarReservaInput {
  clienteId?: string;
  mesaId?: string;
  fechaHora?: string;
  duracionMinutos?: number;
  cantidadPersonas?: number;
  estado?: EstadoReserva;
  notas?: string | null;
}

export async function listarReservas() {
  const res = await api.get<ApiSuccess<Reserva[]>>('/api/reservas');
  return res.data.data;
}

export async function crearReserva(input: CrearReservaInput) {
  const res = await api.post<ApiSuccess<Reserva>>('/api/reservas', input);
  return res.data.data;
}

export async function actualizarReserva(id: string, input: ActualizarReservaInput) {
  const res = await api.put<ApiSuccess<Reserva>>(`/api/reservas/${id}`, input);
  return res.data.data;
}

export async function cancelarReserva(id: string) {
  await api.delete(`/api/reservas/${id}`);
}
