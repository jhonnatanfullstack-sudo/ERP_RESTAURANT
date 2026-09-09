import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Sparkline } from '../charts/Sparkline';
import { useContadorAnimado } from '../../hooks/animacion';
import type { Delta } from '../../utils/metricas';

export type TonoKpi = 'naranja' | 'azul' | 'esmeralda' | 'ambar' | 'violeta';

interface KpiCardProps {
  etiqueta: string;
  /** Valor numérico: se anima al cargar usando `formatear`. */
  valor: number;
  formatear: (valor: number) => string;
  icono: LucideIcon;
  tono?: TonoKpi;
  /** Variación respecto al período anterior; `null` cuando no hay comparación. */
  delta?: Delta | null;
  referenciaDelta?: string;
  detalle?: string;
  /** Tendencia del período para el micrográfico del pie. */
  tendencia?: number[];
  ruta?: string;
  cargando?: boolean;
  /** Cuando subir es malo (ej. tiempos de espera), invierte el color del delta. */
  invertirDelta?: boolean;
}

const tonos: Record<TonoKpi, { icono: string; brillo: string; trazo: string }> = {
  naranja: { icono: 'bg-orange-50 text-orange-600', brillo: 'bg-orange-500/5', trazo: '#ea580c' },
  azul: { icono: 'bg-blue-50 text-blue-600', brillo: 'bg-blue-500/5', trazo: '#2563eb' },
  esmeralda: {
    icono: 'bg-emerald-50 text-emerald-600',
    brillo: 'bg-emerald-500/5',
    trazo: '#059669',
  },
  ambar: { icono: 'bg-amber-50 text-amber-600', brillo: 'bg-amber-500/5', trazo: '#d97706' },
  violeta: { icono: 'bg-violet-50 text-violet-600', brillo: 'bg-violet-500/5', trazo: '#7c3aed' },
};

function PastillaDelta({ delta, invertir }: { delta: Delta; invertir: boolean }) {
  const favorable = invertir ? delta.direccion === 'baja' : delta.direccion === 'sube';
  const estilo =
    delta.direccion === 'igual'
      ? 'bg-zinc-100 text-zinc-600'
      : favorable
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-red-50 text-red-700';
  const Icono =
    delta.direccion === 'igual'
      ? Minus
      : delta.direccion === 'sube'
        ? ArrowUpRight
        : ArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${estilo}`}
    >
      <Icono className="h-3 w-3" strokeWidth={2.5} />
      {Math.abs(delta.porcentaje).toFixed(1)}%
    </span>
  );
}

/** Tarjeta de indicador: valor, variación contra el período anterior y tendencia. */
export function KpiCard({
  etiqueta,
  valor,
  formatear,
  icono: Icono,
  tono = 'naranja',
  delta,
  referenciaDelta,
  detalle,
  tendencia,
  ruta,
  cargando = false,
  invertirDelta = false,
}: KpiCardProps) {
  const animado = useContadorAnimado(cargando ? 0 : valor);
  const estilos = tonos[tono];

  const contenido = (
    <>
      <div
        className={`pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${estilos.brillo}`}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 ${estilos.icono}`}
        >
          <Icono className="h-4.5 w-4.5" strokeWidth={2} />
        </div>
        {delta && !cargando && <PastillaDelta delta={delta} invertir={invertirDelta} />}
        {ruta && (
          <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
        )}
      </div>

      <div className="relative mt-3">
        <p className="truncate text-xs font-medium text-zinc-500">{etiqueta}</p>
        {cargando ? (
          <span className="mt-1 block h-7 w-24 animate-pulse rounded bg-zinc-100" />
        ) : (
          <p className="mt-0.5 truncate text-2xl font-bold text-zinc-900">{formatear(animado)}</p>
        )}
        {(detalle || referenciaDelta) && !cargando && (
          <p className="mt-0.5 truncate text-[11px] text-zinc-400">{detalle ?? referenciaDelta}</p>
        )}
      </div>

      {tendencia && tendencia.length > 1 && !cargando && (
        <div className="relative mt-3 -mb-1">
          <Sparkline valores={tendencia} color={estilos.trazo} />
        </div>
      )}
    </>
  );

  const clases =
    'group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-200';

  if (ruta) {
    return (
      <Link
        to={ruta}
        className={`${clases} hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md`}
      >
        {contenido}
      </Link>
    );
  }

  return <div className={clases}>{contenido}</div>;
}
