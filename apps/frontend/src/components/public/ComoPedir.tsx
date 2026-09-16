import { Fragment } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, MessageCircle, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { SeccionRevelada } from './SeccionRevelada';

/** Misma personalidad "Premium" del resto de la carta pública (ver skill de motion design). */
const EASE_PREMIUM = [0.4, 0, 0.2, 1] as const;

const PASOS = [
  {
    icono: UtensilsCrossed,
    titulo: 'Elige',
    texto: 'Recorre la carta y suma los platos que quieras a tu pedido.',
  },
  {
    icono: MessageCircle,
    titulo: 'Envía',
    texto: 'Tu pedido se arma como mensaje y lo mandas por WhatsApp en un toque.',
  },
  {
    icono: ShoppingBag,
    titulo: 'Recoge',
    texto: 'Te confirmamos por el mismo chat y lo tienes listo a la hora acordada.',
  },
];

/**
 * Explica el flujo real de la carta en tres pasos, sobre un bloque de color. Además de
 * informar, cumple una función de composición: la página es casi toda fotos sobre fondo
 * claro, y esta banda le da un punto de descanso y de marca antes del cierre.
 */
export function ComoPedir() {
  return (
    <section className="relative overflow-hidden bg-(--carta-acento) text-(--carta-acento-contraste)">
      {/* Textura ambiental sutil: sin esto el bloque de color es una sola superficie plana. */}
      <div
        aria-hidden="true"
        className="animar-flotar absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-black/10 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <SeccionRevelada>
          <h2 className="max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
            Pedir es simple
          </h2>
        </SeccionRevelada>

        {/* Flechas entre pasos (solo `sm+`, donde la grilla es una fila): hacen explícito que
            "Elige → Envía → Recoge" es una secuencia y no tres tarjetas sueltas. Cada una entra
            después de que su paso anterior ya se reveló, para que el orden se sienta en el
            tiempo además de en el texto. */}
        <div className="mt-12 grid gap-10 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-start sm:gap-6">
          {PASOS.map((paso, indice) => {
            const Icono = paso.icono;
            return (
              <Fragment key={paso.titulo}>
                <SeccionRevelada
                  retraso={indice * 0.13}
                  className="rounded-3xl bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-white/15 sm:p-7"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
                      <Icono className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="text-4xl font-semibold text-white/30 tabular-nums">
                      {String(indice + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold tracking-tight">{paso.titulo}</h3>
                  <p className="mt-2 leading-relaxed text-white/80">{paso.texto}</p>
                </SeccionRevelada>

                {indice < PASOS.length - 1 && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-100px' }}
                    transition={{ duration: 0.4, ease: EASE_PREMIUM, delay: indice * 0.13 + 0.3 }}
                    className="hidden self-center pt-6 sm:block"
                  >
                    <ChevronRight className="h-6 w-6 text-white/40" strokeWidth={2} />
                  </motion.div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
