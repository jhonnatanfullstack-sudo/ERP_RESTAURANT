import { useEffect, useRef, useState } from 'react';

/**
 * Ancho real del contenedor, para dibujar SVG con geometría correcta en vez de
 * escalar el viewBox (que deformaría trazos y textos).
 */
export function useAnchoElemento<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;

    setAncho(elemento.clientWidth);
    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0];
      if (entrada) setAncho(entrada.contentRect.width);
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return { ref, ancho };
}
