interface AnilloProgresoProps {
  /** Proporción entre 0 y 1. */
  proporcion: number;
  /** Texto grande dentro del anillo (por defecto, el porcentaje). */
  texto?: string;
  detalle?: string;
  tamano?: number;
  grosor?: number;
  color?: string;
  /** Pista: paso más claro del mismo tono, para que el estado se lea en todo el anillo. */
  colorPista?: string;
}

/** Medidor de un solo valor sobre su máximo (ej. ocupación de mesas). */
export function AnilloProgreso({
  proporcion,
  texto,
  detalle,
  tamano = 132,
  grosor = 12,
  color = '#ea580c',
  colorPista = '#ffedd5',
}: AnilloProgresoProps) {
  const acotada = Math.min(1, Math.max(0, proporcion));
  const centro = tamano / 2;
  const radio = (tamano - grosor) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const porcentaje = Math.round(acotada * 100);

  return (
    <div className="relative" style={{ width: tamano, height: tamano }}>
      <svg
        width={tamano}
        height={tamano}
        role="img"
        aria-label={`${porcentaje}%${detalle ? ` — ${detalle}` : ''}`}
      >
        <circle
          cx={centro}
          cy={centro}
          r={radio}
          fill="none"
          stroke={colorPista}
          strokeWidth={grosor}
        />
        <circle
          cx={centro}
          cy={centro}
          r={radio}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          // Con 0% un extremo redondeado dibujaría un punto suelto sobre la pista.
          strokeLinecap={acotada > 0 ? 'round' : 'butt'}
          strokeDasharray={`${circunferencia * acotada} ${circunferencia}`}
          transform={`rotate(-90 ${centro} ${centro})`}
          className="animar-anillo"
          // La animación dibuja el arco desde su inicio: el desplazamiento inicial
          // es la longitud del propio arco (ver keyframe `dibujar-anillo`).
          style={{ '--dash-inicial': circunferencia * acotada } as React.CSSProperties}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-2xl font-bold tabular-nums text-zinc-900">{texto ?? `${porcentaje}%`}</p>
        {detalle && <p className="mt-0.5 text-[11px] text-zinc-500">{detalle}</p>}
      </div>
    </div>
  );
}
