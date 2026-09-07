import { api } from './api';
import type { ApiSuccess, Permiso, Rol } from '../types/api';

export interface CrearRolInput {
  nombre: string;
  descripcion?: string;
  permisoIds: string[];
}

export async function listarRoles() {
  const res = await api.get<ApiSuccess<Rol[]>>('/api/roles');
  return res.data.data;
}

export async function crearRol(input: CrearRolInput) {
  const res = await api.post<ApiSuccess<Rol>>('/api/roles', input);
  return res.data.data;
}

export async function listarPermisos() {
  const res = await api.get<ApiSuccess<Permiso[]>>('/api/permisos');
  return res.data.data;
}
