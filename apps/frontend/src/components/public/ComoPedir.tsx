import { MessageCircle, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useEnVista } from '../../hooks/useEnVista';

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
  const { ref, visible } = useEnVista<HTMLDivElement>();

  return (
    <section className="bg-(--carta-acento) text-(--carta-acento-contraste)">
      <div ref={ref} className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <h2 className="max-w-lg text-3xl font-semibold tracking-tight sm:text-4xl">
          Pedir es simple
        </h2>

        <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {PASOS.map((paso, indice) => {
            const Icono = paso.icono;
            return (
              <div
                key={paso.titulo}
                className={`border-t border-white/25 pt-6 transition-all duration-700 ease-out ${
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                }`}
                style={{ transitionDelay: `${indice * 130}ms` }}
              >
                <div className="flex items-center justify-between">
                  <Icono className="h-6 w-6" strokeWidth={1.75} />
                  <span className="text-4xl font-semibold text-white/30 tabular-nums">
                    {String(indice + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight">{paso.titulo}</h3>
                <p className="mt-2 leading-relaxed text-white/80">{paso.texto}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
