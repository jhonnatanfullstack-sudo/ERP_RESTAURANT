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
