import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000',
  withCredentials: true,
});

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let refrescando: Promise<string | null> | null = null;

async function intentarRefrescar(): Promise<string | null> {
  if (!refrescando) {
    refrescando = api
      .post('/api/auth/refresh')
      .then((res) => {
        const token = res.data.data.accessToken as string;
        setAccessToken(token);
        return token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refrescando = null;
      });
  }
  return refrescando;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const esRutaAuth = originalRequest?.url?.includes('/api/auth/');

    if (error.response?.status === 401 && !originalRequest._retry && !esRutaAuth) {
      originalRequest._retry = true;
      const nuevoToken = await intentarRefrescar();
      if (nuevoToken) {
        originalRequest.headers.Authorization = `Bearer ${nuevoToken}`;
        return api(originalRequest);
      }
      onUnauthorized?.();
    }

    return Promise.reject(error);
  },
);
