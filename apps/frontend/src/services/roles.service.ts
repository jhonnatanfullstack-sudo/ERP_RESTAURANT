import { api } from './api';
import type { ApiSuccess, Permiso, Rol } from '../types/api';

export interface CrearRolInput {
  nombre: string;
  descripcion?: string;
  permisoIds: string[];
}

export interface ActualizarRolInput {
  nombre?: string;
  descripcion?: string;
}

export async function listarRoles() {
  const res = await api.get<ApiSuccess<Rol[]>>('/api/roles');
  return res.data.data;
}

export async function crearRol(input: CrearRolInput) {
  const res = await api.post<ApiSuccess<Rol>>('/api/roles', input);
  return res.data.data;
}

export async function actualizarRol(id: string, input: ActualizarRolInput) {
  const res = await api.put<ApiSuccess<Rol>>(`/api/roles/${id}`, input);
  return res.data.data;
}

export async function asignarPermisos(id: string, permisoIds: string[]) {
  const res = await api.put<ApiSuccess<Rol>>(`/api/roles/${id}/permisos`, { permisoIds });
  return res.data.data;
}

export async function eliminarRol(id: string) {
  await api.delete(`/api/roles/${id}`);
}

export async function listarPermisos() {
  const res = await api.get<ApiSuccess<Permiso[]>>('/api/permisos');
  return res.data.data;
}
