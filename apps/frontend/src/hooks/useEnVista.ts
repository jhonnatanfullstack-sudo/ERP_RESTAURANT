import { useCallback, useState } from 'react';
import { useMovimientoReducido } from './animacion';

/**
 * `true` la primera vez que el elemento referenciado entra en el viewport — para revelar
 * una sección al hacer scroll hasta ella, en vez de animar todo de golpe al montar. Se
 * queda en `true` (no se re-oculta al salir de vista, evita parpadeos al hacer scroll de
 * ida y vuelta). Con `prefers-reduced-motion` empieza visible de una vez.
 *
 * Usa un *callback ref* (con función de limpieza, soportado desde React 19) en vez de
 * `useRef` + `useEffect(fn, [])`: si el elemento observado se monta recién en un render
 * posterior (ej. porque depende de datos que aún están cargando, como aquí), un efecto con
 * dependencias fijas no vuelve a ejecutarse solo porque el ref se adjuntó a un nodo nuevo —
 * el callback ref sí se dispara exactamente cuando el nodo real aparece o desaparece.
 */
export function useEnVista<T extends HTMLElement>() {
  const movimientoReducido = useMovimientoReducido();
  const [visible, setVisible] = useState(movimientoReducido);

  const ref = useCallback(
    (elemento: T | null) => {
      if (!elemento || movimientoReducido) return;

      const observador = new IntersectionObserver(
        ([entrada]) => {
          if (entrada.isIntersecting) {
            setVisible(true);
            observador.disconnect();
          }
        },
        { threshold: 0.15 },
      );
      observador.observe(elemento);
      return () => observador.disconnect();
    },
    [movimientoReducido],
  );

  return { ref, visible };
}
