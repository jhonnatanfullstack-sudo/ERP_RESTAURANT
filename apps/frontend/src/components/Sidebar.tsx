import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import {
  Boxes,
  Building2,
  CalendarCheck,
  ChartColumn,
  ChefHat,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Contact,
  DoorOpen,
  Flame,
  LayoutDashboard,
  Receipt,
  ShieldCheck,
  Truck,
  UtensilsCrossed,
  Wallet,
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

/** Bloque con rótulo dentro del menú (solo jerarquía visual, no navega). */
interface SeccionMenu {
  etiqueta: string;
  items: ItemMenu[];
}

const menu: SeccionMenu[] = [
  {
    etiqueta: 'Operación',
    items: [
      { tipo: 'enlace', etiqueta: 'Dashboard', ruta: '/', icono: LayoutDashboard },
      {
        tipo: 'enlace',
        etiqueta: 'Pedidos',
        ruta: '/pedidos',
        icono: ClipboardList,
        permiso: 'pedidos.ver',
      },
      { tipo: 'enlace', etiqueta: 'Cocina', ruta: '/cocina', icono: Flame, permiso: 'cocina.ver' },
      {
        tipo: 'enlace',
        etiqueta: 'Ventas',
        ruta: '/ventas',
        icono: Receipt,
        permiso: 'ventas.ver',
      },
      { tipo: 'enlace', etiqueta: 'Caja', ruta: '/caja', icono: Wallet, permiso: 'caja.ver' },
      {
        tipo: 'enlace',
        etiqueta: 'Reservas',
        ruta: '/reservas',
        icono: CalendarCheck,
        permiso: 'reservas.ver',
      },
    ],
  },
  {
    // Un grupo nunca se llama igual que uno de sus hijos: "Almacén > Almacenes/Insumos" deja
    // claro que el grupo es el área y los hijos las pantallas concretas.
    etiqueta: 'Almacén',
    items: [
      {
        tipo: 'grupo',
        etiqueta: 'Existencias',
        icono: Boxes,
        hijos: [
          { etiqueta: 'Stock y kardex', ruta: '/inventario', permiso: 'inventario.ver' },
          { etiqueta: 'Insumos', ruta: '/insumos', permiso: 'insumos.ver' },
          { etiqueta: 'Almacenes', ruta: '/almacenes', permiso: 'almacenes.ver' },
        ],
      },
      {
        tipo: 'grupo',
        etiqueta: 'Abastecimiento',
        icono: Truck,
        hijos: [
          { etiqueta: 'Compras', ruta: '/compras', permiso: 'compras.ver' },
          { etiqueta: 'Proveedores', ruta: '/proveedores', permiso: 'proveedores.ver' },
        ],
      },
    ],
  },
  {
    etiqueta: 'Catálogos',
    items: [
      {
        tipo: 'grupo',
        etiqueta: 'Carta',
        icono: UtensilsCrossed,
        hijos: [
          { etiqueta: 'Productos', ruta: '/productos', permiso: 'productos.ver' },
          { etiqueta: 'Categorías', ruta: '/categorias', permiso: 'categorias.ver' },
          { etiqueta: 'Marcas', ruta: '/marcas', permiso: 'marcas.ver' },
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
        tipo: 'enlace',
        etiqueta: 'Clientes',
        ruta: '/clientes',
        icono: Contact,
        permiso: 'clientes.ver',
      },
    ],
  },
  {
    etiqueta: 'Análisis',
    items: [
      {
        tipo: 'enlace',
        etiqueta: 'Reportes',
        ruta: '/reportes',
        icono: ChartColumn,
        permiso: 'reportes.ver',
      },
    ],
  },
  {
    etiqueta: 'Sistema',
    items: [
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
        tipo: 'enlace',
        etiqueta: 'Empresa',
        ruta: '/empresa',
        icono: Building2,
        permiso: 'empresa.ver',
      },
    ],
  },
];

/** Coincide con la ruta exacta o con cualquiera de sus subrutas (ej. `/pedidos/:id`). */
function rutaCoincide(pathname: string, ruta: string): boolean {
  if (ruta === '/') return pathname === '/';
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/** Panel flotante que reemplaza al menú cuando la barra está colapsada. */
interface Flotante {
  etiqueta: string;
  /** Coordenada Y del item que lo abrió, ya acotada al alto de la ventana. */
  top: number;
  hijos?: EnlaceHijo[];
}

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
    const grupoActivo = menu
      .flatMap((seccion) => seccion.items)
      .find(
        (item) =>
          item.tipo === 'grupo' && item.hijos.some((hijo) => rutaCoincide(pathname, hijo.ruta)),
      );
    return grupoActivo ? new Set([grupoActivo.etiqueta]) : new Set();
  });
  const [flotante, setFlotante] = useState<Flotante | null>(null);
  const temporizadorCierre = useRef<number | null>(null);

  // El drawer móvil también se cierra con Escape, no solo tocando el fondo.
  useEffect(() => {
    if (!abiertoMovil) return;
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrarMovil();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [abiertoMovil, onCerrarMovil]);

  useEffect(() => {
    return () => {
      if (temporizadorCierre.current !== null) clearTimeout(temporizadorCierre.current);
    };
  }, []);

  const menuVisible = menu
    .map((seccion) => ({
      ...seccion,
      items: seccion.items
        .map((item): ItemMenu | null => {
          if (item.tipo === 'enlace') {
            return !item.permiso || tienePermiso(item.permiso) ? item : null;
          }
          const hijosVisibles = item.hijos.filter(
            (hijo) => !hijo.permiso || tienePermiso(hijo.permiso),
          );
          return hijosVisibles.length > 0 ? { ...item, hijos: hijosVisibles } : null;
        })
        .filter((item): item is ItemMenu => item !== null),
    }))
    .filter((seccion) => seccion.items.length > 0);

  function cancelarCierre() {
    if (temporizadorCierre.current !== null) {
      clearTimeout(temporizadorCierre.current);
      temporizadorCierre.current = null;
    }
  }

  /** Se cierra con retardo para poder mover el cursor del icono al panel. */
  function programarCierre() {
    cancelarCierre();
    temporizadorCierre.current = window.setTimeout(() => setFlotante(null), 160);
  }

  function abrirFlotante(evento: React.MouseEvent<HTMLElement>, item: ItemMenu) {
    if (!colapsado) return;
    cancelarCierre();
    const caja = evento.currentTarget.getBoundingClientRect();
    const hijos = item.tipo === 'grupo' ? item.hijos : undefined;
    const altoEstimado = 40 + (hijos?.length ?? 0) * 36;
    setFlotante({
      etiqueta: item.etiqueta,
      top: Math.max(8, Math.min(caja.top, window.innerHeight - altoEstimado - 8)),
      hijos,
    });
  }

  function alternarGrupo(etiqueta: string) {
    if (colapsado) {
      onExpandir();
      setFlotante(null);
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
        <button
          type="button"
          aria-label="Cerrar menú"
          tabIndex={-1}
          onClick={onCerrarMovil}
          className="animate-fade-in fixed inset-0 z-30 cursor-default bg-zinc-900/50 md:hidden"
        />
      )}

      <aside
        className={`no-imprimir fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col bg-zinc-900 transition-transform duration-200 ease-in-out md:relative md:inset-auto md:z-auto md:translate-x-0 md:transition-[width] ${
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

        <nav className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 pb-2 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]">
          {menuVisible.map((seccion) => (
            <div key={seccion.etiqueta} className="flex flex-col gap-1">
              <p
                className={`px-3 pt-4 pb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase ${colapsado ? 'md:hidden' : ''}`}
              >
                {seccion.etiqueta}
              </p>
              {colapsado && <div className="mx-2 my-2 hidden border-t border-zinc-800 md:block" />}

              {seccion.items.map((item) => {
                const Icono = item.icono;

                if (item.tipo === 'enlace') {
                  return (
                    <NavLink
                      key={item.ruta}
                      to={item.ruta}
                      end={item.ruta === '/'}
                      // Colapsada, la etiqueta visible se oculta: sin esto el enlace
                      // se queda sin nombre accesible (solo el icono).
                      aria-label={item.etiqueta}
                      onClick={onCerrarMovil}
                      onMouseEnter={(evento) => abrirFlotante(evento, item)}
                      onMouseLeave={programarCierre}
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
                const grupoActivo = item.hijos.some((hijo) => rutaCoincide(pathname, hijo.ruta));
                const idPanel = `submenu-${item.etiqueta.toLowerCase().replace(/\s+/g, '-')}`;

                return (
                  <div key={item.etiqueta}>
                    <button
                      type="button"
                      aria-label={item.etiqueta}
                      aria-expanded={abierto}
                      aria-controls={idPanel}
                      onClick={() => alternarGrupo(item.etiqueta)}
                      onMouseEnter={(evento) => abrirFlotante(evento, item)}
                      onMouseLeave={programarCierre}
                      // El resaltado del grupo activo colapsado es solo de escritorio:
                      // `colapsado` es estado JS, pero la barra angosta es CSS `md:`
                      // — en el drawer móvil el menú se ve completo y no debe pintarse.
                      className={`w-full ${estiloEnlace(false)} ${
                        colapsado ? 'md:justify-center md:px-2' : ''
                      } ${
                        grupoActivo && colapsado
                          ? 'md:bg-orange-600 md:text-white md:shadow-sm md:shadow-orange-600/30 md:hover:bg-orange-600'
                          : ''
                      }`}
                    >
                      <Icono className="h-5 w-5 shrink-0" strokeWidth={2} />
                      <span
                        className={`flex-1 text-left whitespace-nowrap ${colapsado ? 'md:hidden' : ''}`}
                      >
                        {item.etiqueta}
                      </span>
                      {/* Con el grupo cerrado, avisa que la página actual está dentro. */}
                      {grupoActivo && !abierto && (
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500 ${colapsado ? 'md:hidden' : ''}`}
                        />
                      )}
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''} ${
                          colapsado ? 'md:hidden' : ''
                        }`}
                      />
                    </button>

                    {/* Acordeón animado: `grid-rows` 0fr→1fr es la única forma de
                        transicionar hasta altura automática sin medirla en JS. */}
                    <div
                      id={idPanel}
                      // El panel cerrado queda clipeado, no removido: se oculta también
                      // del lector de pantalla (y del tabulador, en cada enlace).
                      aria-hidden={!abierto}
                      className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                        abierto ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      } ${colapsado ? 'md:hidden' : ''}`}
                    >
                      <div className="overflow-hidden">
                        <div className="mt-1 flex flex-col gap-1 pl-4">
                          {item.hijos.map((hijo) => (
                            <NavLink
                              key={hijo.ruta}
                              to={hijo.ruta}
                              end
                              tabIndex={abierto ? undefined : -1}
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
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          type="button"
          onClick={onToggleColapsado}
          title={colapsado ? 'Expandir menú' : 'Ocultar menú'}
          aria-label={colapsado ? 'Expandir menú' : 'Ocultar menú'}
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

      {/* Menú flotante del modo colapsado: sin él, un grupo colapsado obliga a
          expandir toda la barra solo para poder navegar. Solo en escritorio. */}
      {colapsado && flotante && (
        <div
          className="animate-scale-in fixed left-20 z-50 hidden min-w-48 rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 shadow-xl shadow-zinc-950/40 md:block"
          style={{ top: flotante.top }}
          onMouseEnter={cancelarCierre}
          onMouseLeave={programarCierre}
        >
          <p className="px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-white">
            {flotante.etiqueta}
          </p>
          {flotante.hijos?.map((hijo) => (
            <NavLink
              key={hijo.ruta}
              to={hijo.ruta}
              end
              onClick={() => setFlotante(null)}
              className={({ isActive }) =>
                `block rounded-md px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-orange-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`
              }
            >
              {hijo.etiqueta}
            </NavLink>
          ))}
        </div>
      )}
    </>
  );
}
