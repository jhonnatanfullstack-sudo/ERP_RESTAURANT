import { api } from './api';
import type { ApiSuccess, Personal } from '../types/api';

export interface CrearPersonalInput {
  empresaId: string;
  tipoDocumentoIdentidadId: string;
  numeroDocumento: string;
  nombres: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
}

export type ActualizarPersonalInput = Partial<CrearPersonalInput> & { activo?: boolean };

export async function listarPersonal() {
  const res = await api.get<ApiSuccess<Personal[]>>('/api/personal');
  return res.data.data;
}

export async function crearPersonal(input: CrearPersonalInput) {
  const res = await api.post<ApiSuccess<Personal>>('/api/personal', input);
  return res.data.data;
}

export async function actualizarPersonal(id: string, input: ActualizarPersonalInput) {
  const res = await api.put<ApiSuccess<Personal>>(`/api/personal/${id}`, input);
  return res.data.data;
}

export async function eliminarPersonal(id: string) {
  await api.delete(`/api/personal/${id}`);
}
