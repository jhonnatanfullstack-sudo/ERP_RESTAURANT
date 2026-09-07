import { NavLink } from 'react-router';
import {
  Building2,
  ChefHat,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  ShieldCheck,
  Tags,
  UserCircle2,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Enlace {
  etiqueta: string;
  ruta: string;
  icono: typeof LayoutDashboard;
  permiso?: string;
}

const enlaces: Enlace[] = [
  { etiqueta: 'Dashboard', ruta: '/', icono: LayoutDashboard },
  { etiqueta: 'Categorías', ruta: '/categorias', icono: Tags, permiso: 'categorias.ver' },
  {
    etiqueta: 'Productos',
    ruta: '/productos',
    icono: UtensilsCrossed,
    permiso: 'productos.ver',
  },
  { etiqueta: 'Usuarios', ruta: '/usuarios', icono: Users, permiso: 'usuarios.ver' },
  { etiqueta: 'Personal', ruta: '/personal', icono: UserCircle2, permiso: 'personal.ver' },
  { etiqueta: 'Roles', ruta: '/roles', icono: ShieldCheck, permiso: 'roles.ver' },
  { etiqueta: 'Empresa', ruta: '/empresa', icono: Building2, permiso: 'empresa.ver' },
];

interface SidebarProps {
  colapsado: boolean;
  onToggleColapsado: () => void;
  abiertoMovil: boolean;
  onCerrarMovil: () => void;
}

export function Sidebar({
  colapsado,
  onToggleColapsado,
  abiertoMovil,
  onCerrarMovil,
}: SidebarProps) {
  const { tienePermiso } = useAuth();
  const enlacesVisibles = enlaces.filter(
    (enlace) => !enlace.permiso || tienePermiso(enlace.permiso),
  );

  return (
    <>
      {abiertoMovil && (
        <div
          aria-hidden="true"
          onClick={onCerrarMovil}
          className="animate-fade-in fixed inset-0 z-30 bg-zinc-900/50 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col bg-zinc-900 transition-transform duration-200 ease-in-out md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-[width] ${
          abiertoMovil ? 'translate-x-0' : '-translate-x-full'
        } ${colapsado ? 'md:w-20' : 'md:w-64'}`}
      >
        <div
          className={`flex h-16 shrink-0 items-center gap-2.5 px-6 ${colapsado ? 'md:justify-center md:px-0' : ''}`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-600">
            <ChefHat className="h-5 w-5 text-white" strokeWidth={2.25} />
          </div>
          <span
            className={`text-base font-bold tracking-tight whitespace-nowrap text-white ${colapsado ? 'md:hidden' : ''}`}
          >
            Restaurant ERP
          </span>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onCerrarMovil}
            className="ml-auto text-zinc-400 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {enlacesVisibles.map((enlace) => {
            const Icono = enlace.icono;
            return (
              <NavLink
                key={enlace.ruta}
                to={enlace.ruta}
                end
                title={colapsado ? enlace.etiqueta : undefined}
                onClick={onCerrarMovil}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    colapsado ? 'md:justify-center md:px-2' : ''
                  } ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  }`
                }
              >
                <Icono className="h-5 w-5 shrink-0" strokeWidth={2} />
                <span className={`whitespace-nowrap ${colapsado ? 'md:hidden' : ''}`}>
                  {enlace.etiqueta}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={onToggleColapsado}
          title={colapsado ? 'Expandir menú' : 'Ocultar menú'}
          className="hidden shrink-0 items-center justify-center gap-2 border-t border-zinc-800 py-3 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white md:flex"
        >
          {colapsado ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" />
              Ocultar menú
            </>
          )}
        </button>

        <div
          className={`shrink-0 border-t border-zinc-800 p-4 text-xs whitespace-nowrap text-zinc-500 ${colapsado ? 'md:hidden' : ''}`}
        >
          Sistema de gestión de restaurante
        </div>
      </aside>
    </>
  );
}
