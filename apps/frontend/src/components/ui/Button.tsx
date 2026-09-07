import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variante = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  icono?: ReactNode;
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
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={`${estilosBase} ${estilosVariante[variante]} ${className}`} {...props}>
      {icono}
      {children}
    </button>
  );
}
