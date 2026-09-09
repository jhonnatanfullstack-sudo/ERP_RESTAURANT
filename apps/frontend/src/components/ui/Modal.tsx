import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}

export function Modal({ abierto, titulo, onCerrar, children }: ModalProps) {
  if (!abierto) return null;

  return createPortal(
    // React hace bubbling de eventos sintéticos por el árbol de React, no por el DOM: aunque el
    // portal saca este modal del DOM del formulario que lo contenga (ej. BuscadorCliente dentro
    // de "Nuevo pedido"), un <form> propio dentro de este modal seguiría disparando el onSubmit
    // del formulario padre si no se corta aquí. Ver decisiones-tecnicas.md.
    <div
      onSubmit={(e) => e.stopPropagation()}
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
    >
      <div className="animate-scale-in w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
