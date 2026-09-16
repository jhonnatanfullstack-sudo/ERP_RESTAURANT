import { ArrowLeft, Building2, LogOut } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { useAuth } from '../context/AuthContext';

/**
 * Shell exclusivo del panel de proveedor: sin el sidebar operativo del restaurante, para que
 * ver métricas de todas las empresas nunca se confunda visualmente con administrar la propia.
 * Se entra desde el menú de usuario del `AdminLayout` (ver `Navbar.tsx`) y se vuelve con
 * "Mi restaurante".
 */
export function ProveedorLayout() {
  const { logout } = useAuth();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-50">
      <header className="no-imprimir flex h-16 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-4 md:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-600">
            <Building2 className="h-5 w-5 text-white" strokeWidth={2.25} />
          </div>
          <span className="text-base font-bold tracking-tight whitespace-nowrap text-white">
            Panel de proveedor
          </span>
        </div>

        <Link
          to="/"
          className="ml-auto flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Mi restaurante
        </Link>

        <button
          type="button"
          onClick={() => void logout()}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Salir
        </button>
      </header>

      <main className="animate-fade-in flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
