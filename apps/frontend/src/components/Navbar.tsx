import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { usuario, logout } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);

  if (!usuario) {
    return <header className="h-16 border-b border-zinc-200 bg-white" />;
  }

  const iniciales =
    `${usuario.personal.nombres[0] ?? ''}${usuario.personal.apellidoPaterno?.[0] ?? ''}`.toUpperCase();

  return (
    <header className="flex h-16 items-center justify-end border-b border-zinc-200 bg-white px-6">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuAbierto((abierto) => !abierto)}
          className="flex items-center gap-3 rounded-lg py-1.5 pr-2 pl-1.5 hover:bg-zinc-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-700">
            {iniciales || '?'}
          </span>
          <span className="text-left">
            <span className="block text-sm font-medium text-zinc-900">
              {usuario.personal.nombres}
            </span>
            <span className="block text-xs text-zinc-500">{usuario.rol.nombre}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        </button>

        {menuAbierto && (
          <>
            <button
              type="button"
              aria-label="Cerrar menú"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenuAbierto(false)}
            />
            <div className="animate-scale-in absolute right-0 z-20 mt-2 w-52 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
              <Link
                to="/cambiar-password"
                onClick={() => setMenuAbierto(false)}
                className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <KeyRound className="h-4 w-4 text-zinc-400" />
                Cambiar contraseña
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
