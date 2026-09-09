import { useEffect, useState } from 'react';
import { useMovimientoReducido } from './animacion';

/**
 * Desplazamiento en px para un fondo con efecto parallax (se mueve más lento que el
 * scroll — `factor` < 1). Acotado a `maximoPx` para que el fondo nunca se despegue de su
 * contenedor por muy abajo que se haya scrolleado la página. Siempre `0` con
 * `prefers-reduced-motion`.
 */
export function useDesplazamientoParalaje(factor = 0.15, maximoPx = 80): number {
  const movimientoReducido = useMovimientoReducido();
  const [desplazamiento, setDesplazamiento] = useState(0);

  useEffect(() => {
    if (movimientoReducido) return;
    let cuadroPendiente = 0;

    function alScroll() {
      cancelAnimationFrame(cuadroPendiente);
      cuadroPendiente = requestAnimationFrame(() => {
        setDesplazamiento(Math.min(window.scrollY * factor, maximoPx));
      });
    }

    window.addEventListener('scroll', alScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', alScroll);
      cancelAnimationFrame(cuadroPendiente);
    };
  }, [factor, maximoPx, movimientoReducido]);

  return movimientoReducido ? 0 : desplazamiento;
}
