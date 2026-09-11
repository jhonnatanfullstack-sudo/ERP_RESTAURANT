import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface SeccionFormularioProps {
  titulo: string;
  descripcion?: string;
  icono?: LucideIcon;
  /** Contenido alineado a la derecha del encabezado (ej. un total, un badge de estado). */
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Bloque con rótulo dentro de un formulario largo, para que se lea por partes en vez de
 * como una lista plana de campos (ej. "Comprobante", "Cliente", "Pago" en Nueva venta).
 * `Panel` cumple este papel en el dashboard; este es su equivalente para formularios. */
export function SeccionFormulario({
  titulo,
  descripcion,
  icono: Icono,
  acciones,
  children,
  className = '',
}: SeccionFormularioProps) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            {Icono && <Icono className="h-4 w-4 text-zinc-400" strokeWidth={2} />}
            {titulo}
          </h3>
          {descripcion && <p className="mt-0.5 text-xs text-zinc-500">{descripcion}</p>}
        </div>
        {acciones && <div className="shrink-0">{acciones}</div>}
      </header>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}
