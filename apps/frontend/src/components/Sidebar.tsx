import { NavLink } from 'react-router';
import { Building2, ChefHat, LayoutDashboard, ShieldCheck, UserCircle2, Users } from 'lucide-react';

const enlaces = [
  { etiqueta: 'Dashboard', ruta: '/', icono: LayoutDashboard },
  { etiqueta: 'Usuarios', ruta: '/usuarios', icono: Users },
  { etiqueta: 'Personal', ruta: '/personal', icono: UserCircle2 },
  { etiqueta: 'Roles', ruta: '/roles', icono: ShieldCheck },
  { etiqueta: 'Empresa', ruta: '/empresa', icono: Building2 },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-zinc-900">
      <div className="flex h-16 items-center gap-2.5 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600">
          <ChefHat className="h-5 w-5 text-white" strokeWidth={2.25} />
        </div>
        <span className="text-base font-bold tracking-tight text-white">Restaurant ERP</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {enlaces.map((enlace) => {
          const Icono = enlace.icono;
          return (
            <NavLink
              key={enlace.ruta}
              to={enlace.ruta}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`
              }
            >
              <Icono className="h-5 w-5" strokeWidth={2} />
              {enlace.etiqueta}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-zinc-800 p-4 text-xs text-zinc-500">
        Sistema de gestión de restaurante
      </div>
    </aside>
  );
}
