import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { usuario, logout } = useAuth();

  return (
    <header className="flex h-16 items-center justify-end gap-4 border-b border-slate-200 bg-white px-6">
      <span className="text-sm text-slate-500">
        {usuario ? `${usuario.personal.nombres} · ${usuario.rol.nombre}` : 'No autenticado'}
      </span>
      {usuario && (
        <>
          <Link
            to="/cambiar-password"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Cambiar contraseña
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Cerrar sesión
          </button>
        </>
      )}
    </header>
  );
}
