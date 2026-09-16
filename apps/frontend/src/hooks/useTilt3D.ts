import { useCallback, useRef } from 'react';
import type { PointerEvent as PointerEventReact } from 'react';

interface OpcionesTilt {
  /** Inclinación máxima en cada eje, en grados. Por encima de ~12° la foto se deforma. */
  grados?: number;
  /** Acercamiento mientras el puntero está encima. */
  acercar?: number;
}

/**
 * Inclina un elemento en 3D siguiendo al puntero y mueve con él un reflejo especular.
 *
 * Escribe directamente las custom properties del nodo (`--giro-x`, `--giro-y`, `--luz-x`,
 * `--luz-y`) en vez de guardar la posición en el estado de React: el puntero dispara decenas
 * de eventos por segundo y un `setState` en cada uno volvería a renderizar toda la grilla de
 * la carta. Así el trabajo queda en el compositor y el componente no se entera.
 *
 * El giro solo se aplica donde hay un puntero de verdad y sin `prefers-reduced-motion`; esas
 * dos condiciones viven en el CSS (`.tarjeta-3d`), así que en un móvil estos handlers no
 * llegan a ejecutarse porque no hay hover que los dispare.
 */
export function useTilt3D({ grados = 9, acercar = 1.03 }: OpcionesTilt = {}) {
  const ref = useRef<HTMLDivElement>(null);

  const alMover = useCallback(
    (evento: PointerEventReact<HTMLDivElement>) => {
      const nodo = ref.current;
      if (!nodo) return;

      const caja = nodo.getBoundingClientRect();
      // Posición del puntero dentro de la tarjeta, de 0 a 1.
      const x = (evento.clientX - caja.left) / caja.width;
      const y = (evento.clientY - caja.top) / caja.height;

      // El eje X gira según la posición vertical (y al revés): mover el puntero hacia arriba
      // debe levantar el borde superior, no hundirlo.
      nodo.style.setProperty('--giro-x', `${(0.5 - y) * grados * 2}deg`);
      nodo.style.setProperty('--giro-y', `${(x - 0.5) * grados * 2}deg`);
      nodo.style.setProperty('--luz-x', `${x * 100}%`);
      nodo.style.setProperty('--luz-y', `${y * 100}%`);
      nodo.style.setProperty('--acercar', String(acercar));
    },
    [grados, acercar],
  );

  const alSalir = useCallback(() => {
    const nodo = ref.current;
    if (!nodo) return;
    // Solo se limpian el giro y el acercamiento: la transición del CSS devuelve la tarjeta a
    // su sitio. La posición de la luz se queda donde estaba para que el reflejo se apague
    // donde el puntero lo dejó, en vez de saltar al centro mientras se desvanece.
    nodo.style.setProperty('--giro-x', '0deg');
    nodo.style.setProperty('--giro-y', '0deg');
    nodo.style.setProperty('--acercar', '1');
  }, []);

  return { ref, alMover, alSalir };
}
