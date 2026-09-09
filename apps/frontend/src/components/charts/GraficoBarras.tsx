import { useMemo, useState } from 'react';
import { useAnchoElemento } from '../../hooks/useAnchoElemento';
import type { PuntoSerie } from '../../utils/metricas';
import { COLOR_EJE, COLOR_MARCA, COLOR_REJILLA, techoEscala } from './paleta';
import { TooltipGrafico } from './TooltipGrafico';

interface GraficoBarrasProps {
  serie: PuntoSerie[];
  formatearValor: (valor: number) => string;
  formatearEje?: (valor: number) => string;
  color?: string;
  alto?: number;
  etiquetaSerie?: string;
  /** Etiqueta directa sobre la columna más alta (el dato que cuenta la historia). */
  destacarMaximo?: boolean;
}

const MARGEN = { arriba: 22, derecha: 8, abajo: 26, izquierda: 56 };
const DIVISIONES_Y = 4;
const GROSOR_MAXIMO = 24;
const SEPARACION = 2;

/** Columna con la punta redondeada (4px) y la base recta sobre la línea cero. */
function rutaColumna(x: number, y: number, ancho: number, alto: number): string {
  const radio = Math.min(4, ancho / 2, alto);
  return [
    `M ${x} ${y + alto}`,
    `L ${x} ${y + radio}`,
    `Q ${x} ${y} ${x + radio} ${y}`,
    `L ${x + ancho - radio} ${y}`,
    `Q ${x + ancho} ${y} ${x + ancho} ${y + radio}`,
    `L ${x + ancho} ${y + alto}`,
    'Z',
  ].join(' ');
}

/** Comparación de magnitudes por categoría (por ejemplo, venta por franja horaria). */
export function GraficoBarras({
  serie,
  formatearValor,
  formatearEje,
  color = COLOR_MARCA,
  alto = 240,
  etiquetaSerie = 'Total',
  destacarMaximo = true,
}: GraficoBarrasProps) {
  const { ref, ancho } = useAnchoElemento<HTMLDivElement>();
  const [indiceActivo, setIndiceActivo] = useState<number | null>(null);

  const geometria = useMemo(() => {
    const anchoTrama = Math.max(0, ancho - MARGEN.izquierda - MARGEN.derecha);
    const altoTrama = Math.max(0, alto - MARGEN.arriba - MARGEN.abajo);
    const maximo = techoEscala(Math.max(...serie.map((punto) => punto.valor), 0));
    const base = MARGEN.arriba + altoTrama;
    const banda = serie.length > 0 ? anchoTrama / serie.length : 0;
    const grosor = Math.max(4, Math.min(GROSOR_MAXIMO, banda - SEPARACION * 2));
    const indiceMaximo = serie.reduce(
      (mejor, punto, indice) => (punto.valor > (serie[mejor]?.valor ?? 0) ? indice : mejor),
      0,
    );

    const columnas = serie.map((punto, indice) => {
      const altoColumna = maximo === 0 ? 0 : (altoTrama * punto.valor) / maximo;
      const centro = MARGEN.izquierda + banda * indice + banda / 2;
      return {
        ...punto,
        indice,
        centro,
        x: centro - grosor / 2,
        y: base - altoColumna,
        altoColumna,
        xBanda: MARGEN.izquierda + banda * indice,
      };
    });

    return { anchoTrama, altoTrama, maximo, base, banda, grosor, columnas, indiceMaximo };
  }, [ancho, alto, serie]);

  const saltoEtiquetas = Math.max(1, Math.ceil(serie.length / Math.max(4, Math.floor(ancho / 44))));
  const activo = indiceActivo === null ? null : (geometria.columnas[indiceActivo] ?? null);

  return (
    <div ref={ref} className="relative w-full" style={{ height: alto }}>
      {ancho > 0 && (
        <svg
          width={ancho}
          height={alto}
          role="img"
          aria-label={`${etiquetaSerie} por categoría, ${serie.length} categorías`}
        >
          {Array.from({ length: DIVISIONES_Y + 1 }, (_, division) => {
            const valor = (geometria.maximo / DIVISIONES_Y) * division;
            const y = geometria.base - (geometria.altoTrama / DIVISIONES_Y) * division;
            return (
              <g key={division}>
                <line
                  x1={MARGEN.izquierda}
                  y1={y}
                  x2={MARGEN.izquierda + geometria.anchoTrama}
                  y2={y}
                  stroke={COLOR_REJILLA}
                  strokeWidth={1}
                />
                <text
                  x={MARGEN.izquierda - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] tabular-nums"
                  fill={COLOR_EJE}
                >
                  {(formatearEje ?? formatearValor)(valor)}
                </text>
              </g>
            );
          })}

          {geometria.columnas.map((columna) => (
            <g key={columna.etiqueta}>
              {columna.altoColumna > 0 && (
                <path
                  d={rutaColumna(columna.x, columna.y, geometria.grosor, columna.altoColumna)}
                  fill={color}
                  className="animar-barra transition-opacity duration-150"
                  style={{
                    animationDelay: `${columna.indice * 35}ms`,
                    opacity: activo && activo.indice !== columna.indice ? 0.35 : 1,
                  }}
                />
              )}
              {indiceActivo === null &&
                destacarMaximo &&
                columna.indice === geometria.indiceMaximo &&
                columna.valor > 0 && (
                  <text
                    x={columna.centro}
                    y={columna.y - 7}
                    textAnchor="middle"
                    className="text-[10px] font-semibold tabular-nums"
                    fill="#52525b"
                  >
                    {(formatearEje ?? formatearValor)(columna.valor)}
                  </text>
                )}
              {(columna.indice % saltoEtiquetas === 0 || columna.indice === serie.length - 1) && (
                <text
                  x={columna.centro}
                  y={alto - 6}
                  textAnchor="middle"
                  className="text-[10px] tabular-nums"
                  fill={COLOR_EJE}
                >
                  {columna.etiqueta}
                </text>
              )}
              <rect
                x={columna.xBanda}
                y={MARGEN.arriba}
                width={geometria.banda}
                height={geometria.altoTrama}
                fill="transparent"
                onMouseEnter={() => setIndiceActivo(columna.indice)}
                onMouseLeave={() => setIndiceActivo(null)}
              />
            </g>
          ))}
        </svg>
      )}

      {activo && (
        <TooltipGrafico
          x={activo.centro}
          y={Math.max(MARGEN.arriba + 8, activo.y)}
          titulo={activo.detalle}
          filas={[{ etiqueta: etiquetaSerie, valor: formatearValor(activo.valor), color }]}
        />
      )}
    </div>
  );
}
