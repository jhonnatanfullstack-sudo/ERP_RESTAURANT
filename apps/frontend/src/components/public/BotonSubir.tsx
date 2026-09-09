import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useMovimientoReducido } from '../../hooks/animacion';

/** Aparece tras bajar un poco de la portada; sube la página al inicio. Queda a la
 * izquierda para no chocar con el botón de "Mi pedido" (derecha). */
export function BotonSubir() {
  const [visible, setVisible] = useState(false);
  const movimientoReducido = useMovimientoReducido();

  useEffect(() => {
    function alScroll() {
      setVisible(window.scrollY > 700);
    }
    window.addEventListener('scroll', alScroll, { passive: true });
    alScroll();
    return () => window.removeEventListener('scroll', alScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: movimientoReducido ? 'auto' : 'smooth' })}
      aria-label="Volver arriba"
      className="animate-scale-in fixed bottom-5 left-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white text-zinc-600 shadow-lg ring-1 ring-zinc-200 transition-transform hover:-translate-y-0.5 hover:text-orange-600 sm:bottom-8 sm:left-8"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
