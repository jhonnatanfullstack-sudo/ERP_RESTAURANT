import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

type TonoStatCard = 'naranja' | 'azul' | 'esmeralda' | 'ambar' | 'violeta';

interface StatCardProps {
  etiqueta: string;
  valor: number | string;
  icono: LucideIcon;
  cargando?: boolean;
  ruta?: string;
  descripcion?: string;
  tono?: TonoStatCard;
}

const estilosIcono: Record<TonoStatCard, string> = {
  naranja: 'bg-orange-50 text-orange-600',
  azul: 'bg-blue-50 text-blue-600',
  esmeralda: 'bg-emerald-50 text-emerald-600',
  ambar: 'bg-amber-50 text-amber-600',
  violeta: 'bg-violet-50 text-violet-600',
};

export function StatCard({
  etiqueta,
  valor,
  icono: Icono,
  cargando,
  ruta,
  descripcion,
  tono = 'naranja',
}: StatCardProps) {
  const contenido = (
    <>
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${estilosIcono[tono]}`}
      >
        <Icono className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-zinc-500">{etiqueta}</p>
        <p className="text-2xl font-bold text-zinc-900">
          {cargando ? (
            <span className="inline-block h-6 w-8 animate-pulse rounded bg-zinc-200" />
          ) : (
            valor
          )}
        </p>
        {descripcion && <p className="truncate text-xs text-zinc-400">{descripcion}</p>}
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
