import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variante = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  icono?: ReactNode;
  /** Muestra un indicador de progreso y deshabilita el botón mientras dura la acción. */
  cargando?: boolean;
}

const estilosBase =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 px-4 py-2.5';

const estilosVariante: Record<Variante, string> = {
  primary: 'bg-orange-600 text-white shadow-sm shadow-orange-600/20 hover:bg-orange-700',
  secondary: 'bg-white text-zinc-700 border border-zinc-300 hover:bg-zinc-50',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
  danger: 'bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700',
};

export function Button({
  variante = 'primary',
  icono,
  cargando = false,
  className = '',
  disabled,
  children,
  // Por defecto 'button', no 'submit': el default nativo de HTML para un <button> sin `type`
  // dentro de un <form> es "submit", así que un botón secundario (ej. "Confirmar" fuera del
  // flujo normal, o cualquier acción con onClick propio) que olvide pasar `type="button"`
  // dispara el submit del formulario además de su propio onClick — dos acciones a la vez, y
  // si el submit vuelve a montar el bloque que contiene al botón, se ve como un parpadeo o
  // una recarga (así se encontró: ver Propinas.tsx, "Confirmar reparto"). Quien de verdad
  // necesita enviar el formulario sigue pasando `type="submit"` explícito (ver
  // FormActions.tsx), así que este cambio no le quita nada a nadie y cierra la clase de bug.
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${estilosBase} ${estilosVariante[variante]} ${className}`}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...props}
    >
      {cargando ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icono
      )}
      {children}
    </button>
  );
}
