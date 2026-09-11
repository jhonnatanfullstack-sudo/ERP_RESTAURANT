import { api } from './api';
import type { ApiSuccess, UsuarioAutenticado } from '../types/api';

interface SesionResponse {
  accessToken: string;
  usuario: UsuarioAutenticado;
}

export async function login(email: string, password: string) {
  const res = await api.post<ApiSuccess<SesionResponse>>('/api/auth/login', { email, password });
  return res.data.data;
}

export async function refrescar() {
  const res = await api.post<ApiSuccess<SesionResponse>>('/api/auth/refresh');
  return res.data.data;
}

export async function logout() {
  await api.post('/api/auth/logout');
}

export async function cambiarPassword(passwordActual: string, passwordNuevo: string) {
  await api.post('/api/auth/cambiar-password', { passwordActual, passwordNuevo });
}

/** Usuario de la sesión en curso. Se usa tras el alta de una demo, donde ya hay tokens
 * emitidos pero todavía no se cargó el usuario. */
export async function obtenerUsuarioActual() {
  const res = await api.get<ApiSuccess<UsuarioAutenticado>>('/api/auth/me');
  return res.data.data;
}
