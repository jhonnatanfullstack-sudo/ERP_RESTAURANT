import { NavLink } from 'react-router';

const enlaces = [
  { etiqueta: 'Dashboard', ruta: '/' },
  { etiqueta: 'Usuarios', ruta: '/usuarios' },
  { etiqueta: 'Personal', ruta: '/personal' },
  { etiqueta: 'Roles', ruta: '/roles' },
  { etiqueta: 'Empresa', ruta: '/empresa' },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center px-6 text-lg font-semibold text-slate-900">
        Restaurant ERP
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {enlaces.map((enlace) => (
          <NavLink
            key={enlace.ruta}
            to={enlace.ruta}
            end
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`
            }
          >
            {enlace.etiqueta}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
