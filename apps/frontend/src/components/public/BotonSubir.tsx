import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={() =>
            window.scrollTo({ top: 0, behavior: movimientoReducido ? 'auto' : 'smooth' })
          }
          aria-label="Volver arriba"
          initial={{ opacity: 0, scale: 0.7, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.7, y: 10 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.92 }}
          className="fixed bottom-5 left-5 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-(--carta-superficie) text-(--carta-suave) shadow-lg ring-1 ring-(--carta-borde) hover:text-(--carta-acento) sm:bottom-8 sm:left-8"
        >
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
