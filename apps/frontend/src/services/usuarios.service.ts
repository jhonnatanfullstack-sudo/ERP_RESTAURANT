import { api } from './api';
import type { ApiSuccess, Usuario } from '../types/api';

export interface CrearUsuarioInput {
  personalId: string;
  rolId: string;
  email: string;
  password: string;
}

export async function listarUsuarios() {
  const res = await api.get<ApiSuccess<Usuario[]>>('/api/usuarios');
  return res.data.data;
}

export async function crearUsuario(input: CrearUsuarioInput) {
  const res = await api.post<ApiSuccess<Usuario>>('/api/usuarios', input);
  return res.data.data;
}
