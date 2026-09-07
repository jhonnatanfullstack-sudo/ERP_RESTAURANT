import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as authService from '../services/auth.service';
import { setAccessToken, setUnauthorizedHandler } from '../services/api';
import type { UsuarioAutenticado } from '../types/api';

interface AuthContextValue {
  usuario: UsuarioAutenticado | null;
  cargando: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  tienePermiso: (codigo: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUsuario(null));

    authService
      .refrescar()
      .then((sesion) => {
        setAccessToken(sesion.accessToken);
        setUsuario(sesion.usuario);
      })
      .catch(() => {
        setAccessToken(null);
        setUsuario(null);
      })
      .finally(() => setCargando(false));

    return () => setUnauthorizedHandler(null);
  }, []);

  async function handleLogin(email: string, password: string) {
    const sesion = await authService.login(email, password);
    setAccessToken(sesion.accessToken);
    setUsuario(sesion.usuario);
  }

  async function handleLogout() {
    await authService.logout().catch(() => undefined);
    setAccessToken(null);
    setUsuario(null);
  }

  function tienePermiso(codigo: string): boolean {
    return usuario?.rol.permisos.includes(codigo) ?? false;
  }

  return (
    <AuthContext.Provider
      value={{ usuario, cargando, login: handleLogin, logout: handleLogout, tienePermiso }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return context;
}
