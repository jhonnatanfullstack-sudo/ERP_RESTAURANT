import { COLOR_MARCA } from './paleta';

export interface ItemRanking {
  nombre: string;
  valor: number;
  /** Dato de apoyo a la derecha del nombre (ej. "12 uds"). */
  detalle?: string;
}

interface GraficoRankingProps {
  items: ItemRanking[];
  formatearValor: (valor: number) => string;
  color?: string;
}

/**
 * Ranking en barras horizontales. Una sola serie => un solo color: la longitud
 * de la barra ya comunica la magnitud, el color no debe repetir ese dato.
 */
export function GraficoRanking({
  items,
  formatearValor,
  color = COLOR_MARCA,
}: GraficoRankingProps) {
  const maximo = Math.max(...items.map((item) => item.valor), 0);

  return (
    <ol className="space-y-3.5">
      {items.map((item, indice) => (
        <li key={item.nombre} className="group">
          <div className="flex items-baseline gap-2">
            <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-zinc-300 transition-colors group-hover:text-zinc-400">
              {indice + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700">
              {item.nombre}
            </span>
            {item.detalle && (
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">{item.detalle}</span>
            )}
            <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
              {formatearValor(item.valor)}
            </span>
          </div>
          <div className="mt-1.5 ml-6 h-2 overflow-hidden rounded-r-[4px] bg-zinc-100">
            <div
              className="animar-barra-h h-full rounded-r-[4px] transition-opacity duration-150 group-hover:opacity-80"
              style={{
                width: `${maximo === 0 ? 0 : (item.valor / maximo) * 100}%`,
                backgroundColor: color,
                animationDelay: `${indice * 70}ms`,
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
