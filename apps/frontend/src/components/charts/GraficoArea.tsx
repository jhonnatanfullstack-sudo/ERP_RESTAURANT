import { useId, useMemo, useState } from 'react';
import { useAnchoElemento } from '../../hooks/useAnchoElemento';
import type { PuntoSerie } from '../../utils/metricas';
import { COLOR_EJE, COLOR_MARCA, COLOR_REJILLA, techoEscala } from './paleta';
import { TooltipGrafico } from './TooltipGrafico';

interface GraficoAreaProps {
  serie: PuntoSerie[];
  /** Formato del valor en el tooltip (ej. moneda completa). */
  formatearValor: (valor: number) => string;
  /** Formato de las marcas del eje Y (por defecto, el mismo del tooltip). */
  formatearEje?: (valor: number) => string;
  color?: string;
  alto?: number;
  etiquetaSerie?: string;
}

const MARGEN = { arriba: 16, derecha: 16, abajo: 26, izquierda: 56 };
const DIVISIONES_Y = 4;

/**
 * Serie temporal como área + línea. Responde "¿cómo evoluciona la venta?".
 * Una sola serie: no lleva leyenda, el título del panel la nombra.
 */
export function GraficoArea({
  serie,
  formatearValor,
  formatearEje,
  color = COLOR_MARCA,
  alto = 260,
  etiquetaSerie = 'Total',
}: GraficoAreaProps) {
  const { ref, ancho } = useAnchoElemento<HTMLDivElement>();
  const [indiceActivo, setIndiceActivo] = useState<number | null>(null);
  const idGradiente = useId();

  const geometria = useMemo(() => {
    const anchoTrama = Math.max(0, ancho - MARGEN.izquierda - MARGEN.derecha);
    const altoTrama = Math.max(0, alto - MARGEN.arriba - MARGEN.abajo);
    const maximo = techoEscala(Math.max(...serie.map((punto) => punto.valor), 0));
    const base = MARGEN.arriba + altoTrama;

    const x = (indice: number) =>
      serie.length <= 1
        ? MARGEN.izquierda + anchoTrama / 2
        : MARGEN.izquierda + (anchoTrama * indice) / (serie.length - 1);
    const y = (valor: number) => base - (altoTrama * valor) / maximo;

    const puntos = serie.map((punto, indice) => ({ ...punto, cx: x(indice), cy: y(punto.valor) }));
    const rutaLinea = puntos
      .map((punto, indice) => `${indice === 0 ? 'M' : 'L'} ${punto.cx} ${punto.cy}`)
      .join(' ');
    const rutaArea =
      puntos.length > 0
        ? `${rutaLinea} L ${puntos[puntos.length - 1].cx} ${base} L ${puntos[0].cx} ${base} Z`
        : '';

    return { anchoTrama, altoTrama, maximo, base, puntos, rutaLinea, rutaArea };
  }, [ancho, alto, serie]);

  // Con muchos puntos las etiquetas del eje X chocan: se muestra una de cada N.
  const saltoEtiquetas = Math.max(1, Math.ceil(serie.length / Math.max(4, Math.floor(ancho / 90))));

  const activo = indiceActivo === null ? null : (geometria.puntos[indiceActivo] ?? null);

  function alMover(evento: React.MouseEvent<SVGRectElement>) {
    if (serie.length === 0) return;
    const caja = evento.currentTarget.getBoundingClientRect();
    const posicion = evento.clientX - caja.left;
    const paso = geometria.anchoTrama / Math.max(1, serie.length - 1);
    setIndiceActivo(Math.min(serie.length - 1, Math.max(0, Math.round(posicion / paso))));
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height: alto }}>
      {ancho > 0 && (
        <svg
          width={ancho}
          height={alto}
          role="img"
          aria-label={`Evolución de ${etiquetaSerie.toLowerCase()} en ${serie.length} períodos`}
        >
          <defs>
            <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Rejilla y marcas del eje Y */}
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

          {/* Etiquetas del eje X */}
          {geometria.puntos.map((punto, indice) =>
            indice % saltoEtiquetas === 0 || indice === serie.length - 1 ? (
              <text
                key={punto.etiqueta}
                x={punto.cx}
                y={alto - 6}
                textAnchor="middle"
                className="text-[10px]"
                fill={COLOR_EJE}
              >
                {punto.etiqueta}
              </text>
            ) : null,
          )}

          <path d={geometria.rutaArea} fill={`url(#${idGradiente})`} className="animar-area" />
          <path
            d={geometria.rutaLinea}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            className="animar-trazo"
          />

          {/* Punto final destacado con anillo de superficie de 2px */}
          {geometria.puntos.length > 0 && (
            <circle
              cx={geometria.puntos[geometria.puntos.length - 1].cx}
              cy={geometria.puntos[geometria.puntos.length - 1].cy}
              r={4}
              fill={color}
              stroke="#ffffff"
              strokeWidth={2}
            />
          )}

          {/* Cruz de referencia del punto bajo el cursor */}
          {activo && (
            <g>
              <line
                x1={activo.cx}
                y1={MARGEN.arriba}
                x2={activo.cx}
                y2={geometria.base}
                stroke="#d4d4d8"
                strokeWidth={1}
              />
              <circle
                cx={activo.cx}
                cy={activo.cy}
                r={5}
                fill={color}
                stroke="#ffffff"
                strokeWidth={2}
              />
            </g>
          )}

          <rect
            x={MARGEN.izquierda}
            y={MARGEN.arriba}
            width={geometria.anchoTrama}
            height={geometria.altoTrama}
            fill="transparent"
            onMouseMove={alMover}
            onMouseLeave={() => setIndiceActivo(null)}
          />
        </svg>
      )}

      {activo && (
        <TooltipGrafico
          x={activo.cx}
          y={activo.cy}
          titulo={activo.detalle}
          filas={[{ etiqueta: etiquetaSerie, valor: formatearValor(activo.valor), color }]}
        />
      )}
    </div>
  );
}
