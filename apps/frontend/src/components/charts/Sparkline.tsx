import { useId } from 'react';

interface SparklineProps {
  valores: number[];
  color: string;
  alto?: number;
  /** Ancho del viewBox; el SVG se estira al contenedor manteniendo el trazo fino. */
  ancho?: number;
}

/** Micrográfico de tendencia para las tarjetas de métrica: sin ejes ni etiquetas. */
export function Sparkline({ valores, color, alto = 34, ancho = 120 }: SparklineProps) {
  const idGradiente = useId();
  if (valores.length < 2) return <div style={{ height: alto }} />;

  const maximo = Math.max(...valores);
  const minimo = Math.min(...valores);
  const rango = maximo - minimo || 1;
  const puntos = valores.map((valor, indice) => ({
    x: (ancho * indice) / (valores.length - 1),
    y: alto - 3 - ((alto - 6) * (valor - minimo)) / rango,
  }));

  const linea = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${linea} L ${ancho} ${alto} L 0 ${alto} Z`;
  const ultimo = puntos[puntos.length - 1];

  return (
    <svg
      viewBox={`0 0 ${ancho} ${alto}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: alto }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${idGradiente})`} className="animar-area" />
      <path
        d={linea}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        strokeDasharray={1}
        className="animar-trazo"
      />
      <circle cx={ultimo.x} cy={ultimo.y} r={2.5} fill={color} />
    </svg>
  );
}
