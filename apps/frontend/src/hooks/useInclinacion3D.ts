import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useMovimientoReducido } from './animacion';

const PLANO: CSSProperties = { transform: 'rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)' };

/**
 * Inclinación 3D que sigue al cursor (perspectiva + rotateX/rotateY según la posición del
 * puntero dentro del elemento), el efecto "producto flotante" típico de sitios modernos.
 * No es un modelo 3D real (eso requiere archivos `.glb` por platillo — ver
 * `decisiones-tecnicas.md`, "Diseño visual: fotos con efectos en vez de 3D real"); esto le da
 * profundidad a la misma fotografía 2D ya existente, sin librerías ni contenido nuevo.
 * Se desactiva por completo con `prefers-reduced-motion`.
 */
export function useInclinacion3D(intensidadGrados = 10) {
  const ref = useRef<HTMLDivElement>(null);
  const [estilo, setEstilo] = useState<CSSProperties>(PLANO);
  const movimientoReducido = useMovimientoReducido();

  function alMoverPuntero(evento: PointerEvent<HTMLDivElement>) {
    if (movimientoReducido || evento.pointerType === 'touch') return;
    const elemento = ref.current;
    if (!elemento) return;
    const caja = elemento.getBoundingClientRect();
    const x = (evento.clientX - caja.left) / caja.width - 0.5;
    const y = (evento.clientY - caja.top) / caja.height - 0.5;
    setEstilo({
      transform: `rotateX(${(-y * intensidadGrados).toFixed(2)}deg) rotateY(${(x * intensidadGrados).toFixed(2)}deg) scale3d(1.03, 1.03, 1.03)`,
    });
  }

  function alSalirPuntero() {
    setEstilo(PLANO);
  }

  return { ref, estilo, alMoverPuntero, alSalirPuntero };
}
