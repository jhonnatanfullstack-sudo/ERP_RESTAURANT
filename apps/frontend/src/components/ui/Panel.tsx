import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

interface PanelProps {
  titulo: string;
  descripcion?: string;
  icono?: LucideIcon;
  /** Controles del panel (selector de rango, filtros). */
  acciones?: React.ReactNode;
  /** Enlace al módulo correspondiente, alineado al pie del encabezado. */
  enlace?: { texto: string; ruta: string };
  className?: string;
  children: React.ReactNode;
}

/** Contenedor estándar de una sección del dashboard: mismo marco para todas. */
export function Panel({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
  enlace,
  className = '',
  children,
}: PanelProps) {
  return (
    <section
      className={`flex flex-col rounded-xl border border-zinc-200 bg-white shadow-sm ${className}`}
    >
      {/* Sin `flex-wrap`: el enlace y los controles deben quedar en la misma línea del
          título aunque la descripción sea larga (si no, "caen" sobre el contenido). */}
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            {Icono && <Icono className="h-4 w-4 text-zinc-400" strokeWidth={2} />}
            {titulo}
          </h2>
          {descripcion && <p className="mt-0.5 text-xs text-zinc-500">{descripcion}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {acciones}
          {enlace && (
            <Link
              to={enlace.ruta}
              className="group inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-orange-600"
            >
              {enlace.texto}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </header>
      <div className="flex-1 px-5 pb-5">{children}</div>
    </section>
  );
}
