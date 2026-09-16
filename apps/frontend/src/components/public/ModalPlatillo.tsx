import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Minus, Plus, Tag, UtensilsCrossed, X } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import { enlaceWhatsApp } from '../../utils/whatsapp';
import type { Producto } from '../../types/api';

/** Personalidad "Premium" (ver skill de motion design): decelera al entrar, sin rebote —
 * transmite pulcritud, no juego. La salida es ~30% más corta que la entrada: el usuario ya
 * decidió irse, no hace falta retenerlo. */
const EASE_PREMIUM = [0.4, 0, 0.2, 1] as const;
const VARIANTES_FONDO = {
  oculto: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.32, ease: EASE_PREMIUM } },
  salida: { opacity: 0, transition: { duration: 0.22, ease: EASE_PREMIUM } },
};
const VARIANTES_TARJETA = {
  oculto: { opacity: 0, y: 28, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.38, ease: EASE_PREMIUM },
  },
  salida: {
    opacity: 0,
    y: 16,
    scale: 0.98,
    transition: { duration: 0.22, ease: EASE_PREMIUM },
  },
};
/** La foto entra un instante después de la tarjeta y con un leve acercamiento: la misma
 * relación primario/secundario que usa cada tesela del bento al aparecer en la grilla. */
const VARIANTES_FOTO = {
  oculto: { opacity: 0, scale: 1.05 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.45, ease: EASE_PREMIUM, delay: 0.05 },
  },
};

interface ModalPlatilloProps {
  producto: Producto | null;
  cantidadEnBandeja: number;
  onAgregar: () => void;
  onQuitarUna: () => void;
  onCerrar: () => void;
  nombreRestaurante: string;
  telefonoWhatsApp: string | null;
}

/**
 * Ficha de un platillo de la carta pública: la misma foto a sangre y el mismo lenguaje plano de
 * las teselas del bento, ampliados. Se abre sobre un `createPortal` para escapar del recorte de
 * `overflow-hidden` de las secciones de la página.
 */
export function ModalPlatillo({ producto, onCerrar, ...resto }: ModalPlatilloProps) {
  useEffect(() => {
    if (!producto) return;
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [producto, onCerrar]);

  // El `null` vive DENTRO de `AnimatePresence` (no como `return null` temprano): así, al
  // cerrar, `Contenido` se desmonta con su `exit` en vez de desaparecer de golpe.
  return createPortal(
    <AnimatePresence>
      {producto && (
        // `key` por platillo: al abrir otro, el contenido se remonta y la foto vuelve a
        // entrar desde su estado inicial sin necesidad de un efecto que la resetee.
        <Contenido key={producto.id} producto={producto} onCerrar={onCerrar} {...resto} />
      )}
    </AnimatePresence>,
    document.body,
  );
}

type ContenidoProps = Omit<ModalPlatilloProps, 'producto'> & { producto: Producto };

function Contenido({
  producto,
  cantidadEnBandeja,
  onAgregar,
  onQuitarUna,
  onCerrar,
  nombreRestaurante,
  telefonoWhatsApp,
}: ContenidoProps) {
  const imagen = urlImagen(producto.imagenUrl);

  const mensaje = telefonoWhatsApp
    ? enlaceWhatsApp(
        telefonoWhatsApp,
        `¡Hola ${nombreRestaurante}! Quisiera pedir: ${producto.nombre} (${formatearPrecio(producto.precio)}).`,
      )
    : null;

  return (
    // `data-tema="carta"` se repite acá porque el modal se monta con `createPortal` en
    // `document.body`, fuera del árbol de `PublicLayout`: sin esto no heredaría las
    // variables `--carta-*` y las superficies quedarían transparentes.
    <motion.div
      data-tema="carta"
      variants={VARIANTES_FONDO}
      initial="oculto"
      animate="visible"
      exit="salida"
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/70 p-0 backdrop-blur-md sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onCerrar}
        className="absolute inset-0 cursor-default"
      />

      <motion.div
        variants={VARIANTES_TARJETA}
        initial="oculto"
        animate="visible"
        exit="salida"
        className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-(--carta-superficie) shadow-2xl sm:rounded-3xl md:flex-row"
      >
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-(--carta-superficie)/85 text-(--carta-suave) shadow-sm backdrop-blur transition-colors hover:bg-(--carta-superficie) hover:text-(--carta-texto)"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        {/* Foto a sangre, el mismo tratamiento de las teselas del bento: sin marco ni recorte
            circular, para que la ficha se sienta parte de la misma carta y no un componente
            aparte. */}
        <div className="relative aspect-4/3 shrink-0 overflow-hidden bg-(--carta-elevado) md:aspect-auto md:w-1/2">
          {imagen ? (
            <motion.img
              variants={VARIANTES_FOTO}
              initial="oculto"
              animate="visible"
              src={imagen}
              alt={producto.nombre}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-(--carta-suave)">
              <UtensilsCrossed className="h-16 w-16" strokeWidth={1} />
            </div>
          )}
        </div>

        {/* Ficha */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-(--carta-texto) sm:text-3xl">
            {producto.nombre}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-(--carta-acento-tenue) px-3 py-1 text-xs font-semibold text-(--carta-acento)">
              <Tag className="h-3 w-3" />
              {producto.categoria.nombre}
            </span>
            {producto.marca && (
              <span className="rounded-full bg-(--carta-elevado) px-3 py-1 text-xs font-medium text-(--carta-suave)">
                {producto.marca.nombre}
              </span>
            )}
            <span className="rounded-full bg-(--carta-elevado) px-3 py-1 text-xs font-medium text-(--carta-suave)">
              Por {producto.unidadMedida.nombre.toLowerCase()}
            </span>
          </div>

          {/* Sin descripción cargada no se rellena con un texto genérico: sería una promesa
              sobre este plato en concreto que el restaurante nunca escribió. */}
          {producto.descripcion && (
            <p className="mt-4 text-sm leading-relaxed text-(--carta-suave)">
              {producto.descripcion}
            </p>
          )}

          <div className="mt-6 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-(--carta-acento)">
              {formatearPrecio(producto.precio)}
            </span>
            <span className="text-sm text-(--carta-suave)">IGV incluido</span>
          </div>

          <div className="mt-auto flex flex-col gap-3 pt-8">
            {cantidadEnBandeja === 0 ? (
              <button
                type="button"
                onClick={onAgregar}
                className="flex items-center justify-center gap-2 rounded-2xl bg-(--carta-acento) py-3.5 text-sm font-bold text-(--carta-acento-contraste) transition-all hover:opacity-90 active:scale-[0.98]"
              >
                <Plus className="h-4.5 w-4.5" strokeWidth={2.5} />
                Agregar a mi pedido
              </button>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-(--carta-acento-tenue) p-2 ring-1 ring-(--carta-borde)">
                <button
                  type="button"
                  onClick={onQuitarUna}
                  aria-label={`Quitar una unidad de ${producto.nombre}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--carta-superficie) text-(--carta-acento) shadow-sm transition-transform active:scale-90"
                >
                  <Minus className="h-4.5 w-4.5" strokeWidth={2.5} />
                </button>
                <span className="text-sm font-bold text-(--carta-acento) tabular-nums">
                  {cantidadEnBandeja} en tu pedido ·{' '}
                  {formatearPrecio(producto.precio * cantidadEnBandeja)}
                </span>
                <button
                  type="button"
                  onClick={onAgregar}
                  aria-label={`Agregar una unidad más de ${producto.nombre}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--carta-superficie) text-(--carta-acento) shadow-sm transition-transform active:scale-90"
                >
                  <Plus className="h-4.5 w-4.5" strokeWidth={2.5} />
                </button>
              </div>
            )}

            {mensaje && (
              <a
                href={mensaje}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
                Consultar por WhatsApp
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
