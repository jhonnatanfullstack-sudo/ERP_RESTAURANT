import { useState } from 'react';
import type { Segmento } from '../../utils/metricas';
import { COLOR_REJILLA, colorCategorico } from './paleta';

interface GraficoDonaProps {
  segmentos: Segmento[];
  formatearValor: (valor: number) => string;
  /** Texto bajo el total, en el centro de la dona. */
  etiquetaCentro?: string;
  tamano?: number;
  grosor?: number;
}

const SEPARACION_PX = 2;

function puntoEnArco(centro: number, radio: number, angulo: number): [number, number] {
  return [centro + radio * Math.cos(angulo), centro + radio * Math.sin(angulo)];
}

function rutaArco(centro: number, radio: number, inicio: number, fin: number): string {
  const [x1, y1] = puntoEnArco(centro, radio, inicio);
  const [x2, y2] = puntoEnArco(centro, radio, fin);
  const arcoGrande = fin - inicio > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${radio} ${radio} 0 ${arcoGrande} 1 ${x2} ${y2}`;
}

/**
 * Participación sobre un total (parte-todo de un vistazo, hasta 6 segmentos).
 * Siempre acompañada de leyenda con valores: la identidad nunca depende del color.
 */
export function GraficoDona({
  segmentos,
  formatearValor,
  etiquetaCentro = 'Total',
  tamano = 184,
  grosor = 18,
}: GraficoDonaProps) {
  const [indiceActivo, setIndiceActivo] = useState<number | null>(null);

  const total = segmentos.reduce((suma, segmento) => suma + segmento.valor, 0);
  const centro = tamano / 2;
  const radio = (tamano - grosor - 4) / 2;
  const separacion = segmentos.length > 1 ? SEPARACION_PX / radio : 0;

  // Ángulo acumulado antes de cada segmento (sin mutar nada durante el render).
  const arcos = segmentos.map((segmento, indice) => {
    const previo = segmentos.slice(0, indice).reduce((suma, anterior) => suma + anterior.valor, 0);
    const porcion = total > 0 ? segmento.valor / total : 0;
    const inicio = -Math.PI / 2 + (total > 0 ? (previo / total) * Math.PI * 2 : 0);
    const fin = inicio + porcion * Math.PI * 2;
    return {
      ...segmento,
      indice,
      porcion,
      inicio: inicio + separacion / 2,
      fin: Math.max(inicio + separacion / 2, fin - separacion / 2),
      color: colorCategorico(indice),
    };
  });

  const activo = indiceActivo === null ? null : (arcos[indiceActivo] ?? null);
  const esCirculoCompleto = arcos.length === 1 && total > 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
        <svg
          width={tamano}
          height={tamano}
          role="img"
          aria-label={`Distribución de ${etiquetaCentro.toLowerCase()}`}
        >
          <circle
            cx={centro}
            cy={centro}
            r={radio}
            fill="none"
            stroke={COLOR_REJILLA}
            strokeWidth={grosor}
          />
          {esCirculoCompleto ? (
            <circle
              cx={centro}
              cy={centro}
              r={radio}
              fill="none"
              stroke={arcos[0].color}
              strokeWidth={grosor}
              onMouseEnter={() => setIndiceActivo(0)}
              onMouseLeave={() => setIndiceActivo(null)}
            />
          ) : (
            arcos.map((arco) => (
              <path
                key={arco.etiqueta}
                d={rutaArco(centro, radio, arco.inicio, arco.fin)}
                fill="none"
                stroke={arco.color}
                strokeWidth={activo?.indice === arco.indice ? grosor + 5 : grosor}
                pathLength={1}
                strokeDasharray={1}
                className="animar-trazo cursor-pointer transition-all duration-150"
                style={{
                  animationDelay: `${arco.indice * 90}ms`,
                  opacity: activo && activo.indice !== arco.indice ? 0.4 : 1,
                }}
                onMouseEnter={() => setIndiceActivo(arco.indice)}
                onMouseLeave={() => setIndiceActivo(null)}
              />
            ))
          )}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-lg font-bold text-zinc-900">
            {formatearValor(activo ? activo.valor : total)}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">
            {activo ? `${activo.etiqueta} · ${(activo.porcion * 100).toFixed(0)}%` : etiquetaCentro}
          </p>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2">
        {arcos.map((arco) => (
          <li
            key={arco.etiqueta}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors"
            style={{ backgroundColor: activo?.indice === arco.indice ? '#fafafa' : 'transparent' }}
            onMouseEnter={() => setIndiceActivo(arco.indice)}
            onMouseLeave={() => setIndiceActivo(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: arco.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-600">{arco.etiqueta}</span>
            <span className="text-sm font-semibold tabular-nums text-zinc-900">
              {formatearValor(arco.valor)}
            </span>
            <span className="w-10 text-right text-xs tabular-nums text-zinc-400">
              {(arco.porcion * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
