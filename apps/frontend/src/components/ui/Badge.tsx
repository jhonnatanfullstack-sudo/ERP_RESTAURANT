type Tono = 'exito' | 'neutral' | 'peligro';

interface BadgeProps {
  tono?: Tono;
  children: React.ReactNode;
}

const estilos: Record<Tono, string> = {
  exito: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
  neutral: 'bg-zinc-100 text-zinc-600 ring-1 ring-inset ring-zinc-500/10',
  peligro: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
};

export function Badge({ tono = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${estilos[tono]}`}
    >
      {children}
    </span>
  );
}
