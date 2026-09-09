export interface FilaTooltip {
  etiqueta?: string;
  valor: string;
  color?: string;
}

interface TooltipGraficoProps {
  /** Posición en píxeles dentro del contenedor relativo del gráfico. */
  x: number;
  y: number;
  titulo: string;
  filas: FilaTooltip[];
}

/** Tooltip compartido por todos los gráficos, para que se vean iguales. */
export function TooltipGrafico({ x, y, titulo, filas }: TooltipGraficoProps) {
  return (
    <div
      className="animate-fade-in pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-lg"
      style={{ left: x, top: y - 10 }}
    >
      <p className="text-[11px] font-medium whitespace-nowrap text-zinc-500">{titulo}</p>
      {filas.map((fila, indice) => (
        <div key={indice} className="mt-0.5 flex items-center gap-2 whitespace-nowrap">
          {fila.color && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: fila.color }}
            />
          )}
          {fila.etiqueta && <span className="text-xs text-zinc-500">{fila.etiqueta}</span>}
          <span className="ml-auto text-sm font-semibold text-zinc-900">{fila.valor}</span>
        </div>
      ))}
    </div>
  );
}
