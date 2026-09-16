import { useEffect, useRef, useState } from 'react';

/** Elementos aún no revelados, pendientes de que el scroll los alcance. Un único listener
 * de `scroll` compartido por todos ellos (en vez de uno por tarjeta) es lo que mantiene esto
 * barato aunque la carta tenga decenas de platos. */
const pendientes = new Set<() => void>();
let listenerActivo = false;

function revisarPendientes() {
  // Copia: cada callback puede borrarse a sí mismo de `pendientes` al revelarse, y mutar un
  // Set mientras se itera sobre él es exactamente el tipo de cosa que se quiere evitar acá.
  for (const revisar of [...pendientes]) revisar();
}

function asegurarListener() {
  if (listenerActivo) return;
  listenerActivo = true;
  window.addEventListener('scroll', revisarPendientes, { passive: true });
  window.addEventListener('resize', revisarPendientes);
}

/**
 * `true` una vez que el elemento entra en la ventana visible (con un margen de anticipo), y
 * se queda en `true` para siempre — revelado de una sola vez, sin retroceder.
 *
 * A propósito NO usa `IntersectionObserver`: ese API solo garantiza avisar de *transiciones*
 * de intersección ocurridas mientras está observando. Si el observador se registra (via
 * efecto de React) después de que un salto de scroll grande ya movió el elemento de "debajo
 * de la pantalla" a "encima de la pantalla" sin pasar por un cuadro intermedio observado, la
 * primera notificación es "no intersecta" y ninguna más llega después — el elemento se queda
 * con opacidad 0 para siempre. Se reprodujo así con `whileInView` de Framer Motion.
 *
 * El reemplazo directo —una animación CSS ligada al scroll (`animation-timeline: view()`)—
 * sí era inmune a ese salto, pero por sujetar la opacidad a la posición TAL COMO ESTÁ AHORA
 * no tiene memoria de "ya se mostró": al subir el scroll de vuelta por la misma zona, se
 * desvanece, y al bajar de nuevo reaparece. Con decenas de platos, eso es un parpadeo
 * constante en el uso normal de ir y volver a leer la carta.
 *
 * Esto resuelve ambos casos midiendo la posición real del elemento en cada scroll (una
 * lectura de geometría es correcta sin importar cómo se llegó hasta ahí, a diferencia de un
 * API asíncrono con su propia cadencia de muestreo) y, apenas se revela, se quita de la
 * lista de pendientes — no hay condición bajo la cual pueda "desrevelarse".
 */
export function useRevelarEnScroll<T extends HTMLElement>(margenAnticipo = 120) {
  const ref = useRef<T>(null);
  const [revelado, setRevelado] = useState(false);

  useEffect(() => {
    if (revelado) return;
    const nodo = ref.current;
    if (!nodo) return;

    function revisar() {
      if (!nodo) return;
      if (nodo.getBoundingClientRect().top < window.innerHeight + margenAnticipo) {
        pendientes.delete(revisar);
        setRevelado(true);
      }
    }

    asegurarListener();
    pendientes.add(revisar);
    // Por si ya está en pantalla (o pasada) al montar: sin esto, un plato que carga ya
    // visible en la mitad superior esperaría al primer scroll para aparecer.
    revisar();
    // Reintento breve: cubre el primer acomodo del layout tras cargar imágenes o fuentes,
    // que puede mover la posición del elemento sin que ocurra ningún scroll.
    const idReintento = window.setTimeout(revisar, 300);

    return () => {
      pendientes.delete(revisar);
      window.clearTimeout(idReintento);
    };
  }, [revelado, margenAnticipo]);

  return { ref, revelado };
}
