import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

interface StatCardProps {
  etiqueta: string;
  valor: number | string;
  icono: LucideIcon;
  cargando?: boolean;
  ruta?: string;
}

export function StatCard({ etiqueta, valor, icono: Icono, cargando, ruta }: StatCardProps) {
  const contenido = (
    <>
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
    </>
  );

  const clases =
    'flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all';

  if (ruta) {
    return (
      <Link to={ruta} className={`${clases} hover:-translate-y-0.5 hover:shadow-md`}>
        {contenido}
      </Link>
    );
  }

  return <div className={clases}>{contenido}</div>;
}
