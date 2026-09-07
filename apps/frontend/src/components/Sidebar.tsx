import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import {
  Building2,
  ChefHat,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  DoorOpen,
  LayoutDashboard,
  ShieldCheck,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface EnlaceHijo {
  etiqueta: string;
  ruta: string;
  permiso?: string;
}

interface ItemEnlace {
  tipo: 'enlace';
  etiqueta: string;
  ruta: string;
  icono: LucideIcon;
  permiso?: string;
}

interface ItemGrupo {
  tipo: 'grupo';
  etiqueta: string;
  icono: LucideIcon;
  hijos: EnlaceHijo[];
}

type ItemMenu = ItemEnlace | ItemGrupo;

const menu: ItemMenu[] = [
  { tipo: 'enlace', etiqueta: 'Dashboard', ruta: '/', icono: LayoutDashboard },
  {
    tipo: 'grupo',
    etiqueta: 'Carta',
    icono: UtensilsCrossed,
    hijos: [
      { etiqueta: 'Categorías', ruta: '/categorias', permiso: 'categorias.ver' },
      { etiqueta: 'Marcas', ruta: '/marcas', permiso: 'marcas.ver' },
      { etiqueta: 'Productos', ruta: '/productos', permiso: 'productos.ver' },
    ],
  },
  {
    tipo: 'grupo',
    etiqueta: 'Local',
    icono: DoorOpen,
    hijos: [
      { etiqueta: 'Salones', ruta: '/salones', permiso: 'salones.ver' },
      { etiqueta: 'Mesas', ruta: '/mesas', permiso: 'mesas.ver' },
    ],
  },
  {
    tipo: 'grupo',
    etiqueta: 'Administración',
    icono: ShieldCheck,
    hijos: [
      { etiqueta: 'Usuarios', ruta: '/usuarios', permiso: 'usuarios.ver' },
      { etiqueta: 'Personal', ruta: '/personal', permiso: 'personal.ver' },
      { etiqueta: 'Roles', ruta: '/roles', permiso: 'roles.ver' },
    ],
  },
  {
    tipo: 'grupo',
    etiqueta: 'Empresa',
    icono: Building2,
    hijos: [{ etiqueta: 'Configuración', ruta: '/empresa', permiso: 'empresa.ver' }],
  },
];

interface SidebarProps {
  colapsado: boolean;
  onToggleColapsado: () => void;
  onExpandir: () => void;
  abiertoMovil: boolean;
  onCerrarMovil: () => void;
}

export function Sidebar({
  colapsado,
  onToggleColapsado,
  onExpandir,
  abiertoMovil,
  onCerrarMovil,
}: SidebarProps) {
  const { tienePermiso } = useAuth();
  const { pathname } = useLocation();
  // Se abre de entrada el grupo que contiene la ruta actual (ej. al entrar
  // directo por URL a /marcas); a partir de ahí el usuario controla el resto.
  const [gruposAbiertos, setGruposAbiertos] = useState<Set<string>>(() => {
    const grupoActivo = menu.find(
      (item) => item.tipo === 'grupo' && item.hijos.some((h) => h.ruta === pathname),
    );
    return grupoActivo ? new Set([grupoActivo.etiqueta]) : new Set();
  });

  const menuVisible: ItemMenu[] = menu
    .map((item): ItemMenu | null => {
      if (item.tipo === 'enlace') {
        return !item.permiso || tienePermiso(item.permiso) ? item : null;
      }
      const hijosVisibles = item.hijos.filter((h) => !h.permiso || tienePermiso(h.permiso));
      return hijosVisibles.length > 0 ? { ...item, hijos: hijosVisibles } : null;
    })
    .filter((item): item is ItemMenu => item !== null);

  function alternarGrupo(etiqueta: string) {
    if (colapsado) {
      onExpandir();
      setGruposAbiertos((previo) => new Set(previo).add(etiqueta));
      return;
    }
    setGruposAbiertos((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(etiqueta)) {
        nuevo.delete(etiqueta);
      } else {
        nuevo.add(etiqueta);
      }
      return nuevo;
    });
  }

  const estiloEnlace = (activo: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      activo
        ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/30'
        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
    }`;

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
          {menuVisible.map((item) => {
            const Icono = item.icono;

            if (item.tipo === 'enlace') {
              return (
                <NavLink
                  key={item.ruta}
                  to={item.ruta}
                  end
                  title={colapsado ? item.etiqueta : undefined}
                  onClick={onCerrarMovil}
                  className={({ isActive }) =>
                    `${estiloEnlace(isActive)} ${colapsado ? 'md:justify-center md:px-2' : ''}`
                  }
                >
                  <Icono className="h-5 w-5 shrink-0" strokeWidth={2} />
                  <span className={`whitespace-nowrap ${colapsado ? 'md:hidden' : ''}`}>
                    {item.etiqueta}
                  </span>
                </NavLink>
              );
            }

            const abierto = gruposAbiertos.has(item.etiqueta);
            const grupoActivo = item.hijos.some((h) => h.ruta === pathname);

            return (
              <div key={item.etiqueta}>
                <button
                  type="button"
                  title={colapsado ? item.etiqueta : undefined}
                  onClick={() => alternarGrupo(item.etiqueta)}
                  className={`w-full ${estiloEnlace(grupoActivo && colapsado)} ${
                    colapsado ? 'md:justify-center md:px-2' : ''
                  }`}
                >
                  <Icono className="h-5 w-5 shrink-0" strokeWidth={2} />
                  <span
                    className={`flex-1 text-left whitespace-nowrap ${colapsado ? 'md:hidden' : ''}`}
                  >
                    {item.etiqueta}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''} ${
                      colapsado ? 'md:hidden' : ''
                    }`}
                  />
                </button>

                {abierto && (
                  <div className={`mt-1 flex flex-col gap-1 pl-4 ${colapsado ? 'md:hidden' : ''}`}>
                    {item.hijos.map((hijo) => (
                      <NavLink
                        key={hijo.ruta}
                        to={hijo.ruta}
                        end
                        onClick={onCerrarMovil}
                        className={({ isActive }) =>
                          `rounded-lg border-l-2 py-2 pl-3 text-sm font-medium transition-colors ${
                            isActive
                              ? 'border-orange-600 text-white'
                              : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                          }`
                        }
                      >
                        {hijo.etiqueta}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
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
