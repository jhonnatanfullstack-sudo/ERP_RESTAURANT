import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

const CONSULTA_MOVIMIENTO = '(prefers-reduced-motion: reduce)';

function suscribirMovimiento(alCambiar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_MOVIMIENTO);
  consulta.addEventListener('change', alCambiar);
  return () => consulta.removeEventListener('change', alCambiar);
}

function leerMovimientoReducido(): boolean {
  return window.matchMedia(CONSULTA_MOVIMIENTO).matches;
}

/** `true` cuando el sistema del usuario pide reducir el movimiento. */
export function useMovimientoReducido(): boolean {
  return useSyncExternalStore(suscribirMovimiento, leerMovimientoReducido, () => true);
}

/**
 * Interpola el número mostrado hasta `valor` para que las métricas "suban" al
 * cargar. Si el usuario pide menos movimiento, devuelve el valor final directo.
 */
export function useContadorAnimado(valor: number, duracion = 900): number {
  const movimientoReducido = useMovimientoReducido();
  const [mostrado, setMostrado] = useState(0);
  const origenRef = useRef(0);

  useEffect(() => {
    if (movimientoReducido) return;

    const origen = origenRef.current;
    const inicio = performance.now();
    let cuadro = 0;

    const paso = (ahora: number) => {
      const avance = Math.min(1, (ahora - inicio) / duracion);
      // easeOutCubic: arranca rápido y frena al final.
      const suavizado = 1 - (1 - avance) ** 3;
      const actual = origen + (valor - origen) * suavizado;
      origenRef.current = actual;
      setMostrado(actual);
      if (avance < 1) cuadro = requestAnimationFrame(paso);
    };

    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor, duracion, movimientoReducido]);

  return movimientoReducido ? valor : mostrado;
}
