import type { LucideIcon } from 'lucide-react';

interface TarjetaOpcionProps {
  activo: boolean;
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  onClick: () => void;
}

/**
 * Opción seleccionable con icono + título + descripción, estilo "radio-card": mismo
 * significado que un radio pero más legible que un `<select>` de 2-3 opciones. Usado para
 * elegir el origen/modo de un formulario (ej. "En el local" / "Para llevar" en Pedidos,
 * "Desde un pedido" / "Venta directa" en Ventas) — reutilizar en vez de duplicar el patrón.
 */
export function TarjetaOpcion({
  activo,
  icono: Icono,
  titulo,
  descripcion,
  onClick,
}: TarjetaOpcionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex flex-1 items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
        activo
          ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500/20'
          : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          activo ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-500'
        }`}
      >
        <Icono className="h-4.5 w-4.5" strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-zinc-900">{titulo}</span>
        <span className="block text-xs text-zinc-500">{descripcion}</span>
      </span>
    </button>
  );
}
