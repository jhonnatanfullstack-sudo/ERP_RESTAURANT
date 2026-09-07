import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  etiqueta: string;
  valor: number | string;
  icono: LucideIcon;
  cargando?: boolean;
}

export function StatCard({ etiqueta, valor, icono: Icono, cargando }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
        <Icono className="h-5 w-5" strokeWidth={2} />
      </div>
      <div>
        <p className="text-sm text-zinc-500">{etiqueta}</p>
        <p className="text-2xl font-bold text-zinc-900">
          {cargando ? (
            <span className="inline-block h-6 w-8 animate-pulse rounded bg-zinc-200" />
          ) : (
            valor
          )}
        </p>
      </div>
    </div>
  );
}
