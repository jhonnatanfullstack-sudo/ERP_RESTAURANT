import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Share2 } from 'lucide-react';

/** Cuánto dura el acuse de "copiado" antes de volver al estado normal. */
const MS_ACUSE = 2000;

/** Peso "ligero" (ver skill de motion design): un ícono que cambia de estado se resuelve en
 * menos de 200ms, no con la misma duración que una tarjeta o un modal. */
const TRANSICION_ICONO = { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const };

interface BotonCompartirProps {
  /** Título con el que se ofrece el enlace en el menú nativo de compartir. */
  titulo: string;
  texto: string;
  className?: string;
}

/**
 * Comparte el enlace de la carta. En un celular usa el menú nativo del sistema
 * (`navigator.share`, que ahí es lo esperado y ofrece WhatsApp de primera); en un escritorio
 * sin ese soporte cae a copiar el enlace al portapapeles, que es lo que el visitante iba a
 * hacer a mano de todos modos.
 */
export function BotonCompartir({ titulo, texto, className = '' }: BotonCompartirProps) {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);

  // El acuse se apaga solo; si el componente se desmonta antes, el timeout quedaría llamando
  // a un setState sobre un componente ya ido.
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  async function compartir() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: titulo, text: texto, url });
        return;
      } catch {
        // El visitante cerró el menú de compartir, o el navegador lo rechazó: se cae al
        // portapapeles en vez de dejar el botón sin hacer nada.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      temporizador.current = window.setTimeout(() => setCopiado(false), MS_ACUSE);
    } catch {
      // Sin portapapeles disponible (contexto no seguro, permiso denegado) no queda nada
      // que hacer desde la página: el visitante siempre puede copiar la barra de direcciones.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void compartir()}
      className={`flex items-center gap-2 overflow-hidden rounded-xl border border-(--carta-borde) px-7 py-4 text-sm font-semibold transition-colors hover:bg-(--carta-elevado) ${className}`}
    >
      {/* `mode="wait"` para que el ícono saliente termine antes de que entre el siguiente: con
          los dos a la vez el cambio de ancho del botón (ícono + texto distintos) se ve saltado. */}
      <AnimatePresence mode="wait" initial={false}>
        {copiado ? (
          <motion.span
            key="copiado"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={TRANSICION_ICONO}
            className="flex items-center gap-2"
          >
            <Check className="h-4 w-4 text-(--carta-acento)" strokeWidth={2.5} />
            Enlace copiado
          </motion.span>
        ) : (
          <motion.span
            key="compartir"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={TRANSICION_ICONO}
            className="flex items-center gap-2"
          >
            <Share2 className="h-4 w-4" strokeWidth={2.25} />
            Compartir
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
