import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icono: LucideIcon;
  titulo: string;
  descripcion?: string;
}

export function EmptyState({ icono: Icono, titulo, descripcion }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
        <Icono className="h-6 w-6" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-700">{titulo}</p>
        {descripcion && <p className="mt-1 text-sm text-zinc-500">{descripcion}</p>}
      </div>
    </div>
  );
}
