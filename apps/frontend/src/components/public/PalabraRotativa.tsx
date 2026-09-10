import { useEffect, useState } from 'react';
import { useMovimientoReducido } from '../../hooks/animacion';

const INTERVALO_MS = 2400;

interface PalabraRotativaProps {
  palabras: string[];
}

/**
 * Palabra del titular que se reemplaza sola cada pocos segundos. Reserva el ancho de la
 * palabra más larga con una copia invisible, para que el resto de la línea no salte en cada
 * cambio. Con `prefers-reduced-motion` se queda fija en la primera.
 */
export function PalabraRotativa({ palabras }: PalabraRotativaProps) {
  const movimientoReducido = useMovimientoReducido();
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (movimientoReducido || palabras.length < 2) return;
    const id = setInterval(() => {
      setIndice((previo) => (previo + 1) % palabras.length);
    }, INTERVALO_MS);
    return () => clearInterval(id);
  }, [movimientoReducido, palabras.length]);

  const actual = palabras[indice] ?? palabras[0];
  const masLarga = palabras.reduce((a, b) => (b.length > a.length ? b : a), '');

  return (
    <span className="relative inline-grid overflow-hidden align-bottom">
      {/* Copia invisible que fija el ancho: sin ella la línea se reacomoda en cada palabra. */}
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {masLarga}
      </span>
      <span
        key={actual}
        className="animar-palabra col-start-1 row-start-1 text-left text-(--carta-acento)"
      >
        {actual}
      </span>
    </span>
  );
}
