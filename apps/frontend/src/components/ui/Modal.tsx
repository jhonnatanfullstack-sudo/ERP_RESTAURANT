import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type TamanoModal = 'md' | 'lg' | 'xl';

interface ModalProps {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  onCerrar: () => void;
  children: ReactNode;
  /** Ancho máximo: 'md' (por defecto, formularios simples), 'lg' o 'xl' (formularios con
   * varias secciones o una lista/carrito editable, ej. la venta directa). */
  tamano?: TamanoModal;
  /** 'superior' para un selector abierto encima de otro modal ya abierto (ej. elegir el
   * pedido a facturar dentro de "Nueva venta"): sube el z-index por encima del modal base y
   * oscurece un poco más el fondo, para que se note que se abrió un nivel más profundo. */
  capa?: 'base' | 'superior';
}

const anchoPorTamano: Record<TamanoModal, string> = {
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-3xl',
};

const zIndicePorCapa: Record<NonNullable<ModalProps['capa']>, string> = {
  base: 'z-50',
  superior: 'z-[60]',
};

export function Modal({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  tamano = 'md',
  capa = 'base',
}: ModalProps) {
  if (!abierto) return null;

  return createPortal(
    // React hace bubbling de eventos sintéticos por el árbol de React, no por el DOM: aunque el
    // portal saca este modal del DOM del formulario que lo contenga (ej. BuscadorCliente dentro
    // de "Nuevo pedido"), un <form> propio dentro de este modal seguiría disparando el onSubmit
    // del formulario padre si no se corta aquí. Ver decisiones-tecnicas.md.
    <div
      onSubmit={(e) => e.stopPropagation()}
      className={`animate-fade-in fixed inset-0 ${zIndicePorCapa[capa]} flex items-center justify-center p-4 backdrop-blur-sm ${capa === 'superior' ? 'bg-zinc-900/65' : 'bg-zinc-900/50'}`}
    >
      <div
        className={`animate-scale-in flex max-h-[calc(100vh-2rem)] w-full flex-col rounded-2xl bg-white shadow-xl ${anchoPorTamano[tamano]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 p-6 pb-5">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">{titulo}</h2>
            {descripcion && <p className="mt-1 text-sm text-zinc-500">{descripcion}</p>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
