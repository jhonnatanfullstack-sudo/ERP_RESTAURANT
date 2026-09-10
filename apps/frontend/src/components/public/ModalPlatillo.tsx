import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Minus, Plus, RotateCcw, Tag, UtensilsCrossed, X } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import { enlaceWhatsApp } from '../../utils/whatsapp';
import { useMovimientoReducido } from '../../hooks/animacion';
import type { Producto } from '../../types/api';

/** Cuántos grados gira la foto por cada píxel arrastrado. */
const GRADOS_POR_PIXEL = 0.35;
/** Tope de giro: más allá la foto se ve de canto y pierde sentido. */
const GIRO_MAXIMO = 24;

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
 * Ficha inmersiva de un platillo de la carta pública: la foto se puede girar arrastrándola
 * (rotateX/rotateY sobre el plano, con las capas de precio y categoría flotando por delante
 * gracias a `translateZ`). Sigue siendo la misma fotografía 2D, no un modelo `.glb` — ver
 * `useInclinacion3D` y `decisiones-tecnicas.md`.
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

  if (!producto) return null;

  // `key` por platillo: al abrir otro, el contenido se remonta y el giro arranca en cero sin
  // necesidad de un efecto que lo resetee.
  return createPortal(
    <Contenido key={producto.id} producto={producto} onCerrar={onCerrar} {...resto} />,
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
  const movimientoReducido = useMovimientoReducido();
  const [giro, setGiro] = useState({ x: 0, y: 0 });
  // Es estado y no ref porque decide si la foto sigue al dedo al instante (sin transición) o
  // vuelve a su sitio con animación: eso se lee durante el render.
  const [arrastrando, setArrastrando] = useState(false);
  const inicioArrastre = useRef<{ x: number; y: number } | null>(null);

  const imagen = urlImagen(producto.imagenUrl);

  function girarCon(dx: number, dy: number) {
    setGiro({
      x: Math.max(-GIRO_MAXIMO, Math.min(GIRO_MAXIMO, -dy * GRADOS_POR_PIXEL)),
      y: Math.max(-GIRO_MAXIMO, Math.min(GIRO_MAXIMO, dx * GRADOS_POR_PIXEL)),
    });
  }

  function alBajarPuntero(evento: React.PointerEvent<HTMLDivElement>) {
    if (movimientoReducido) return;
    inicioArrastre.current = { x: evento.clientX, y: evento.clientY };
    setArrastrando(true);
    evento.currentTarget.setPointerCapture(evento.pointerId);
  }

  function alMoverPuntero(evento: React.PointerEvent<HTMLDivElement>) {
    if (movimientoReducido) return;
    const inicio = inicioArrastre.current;
    // Sin arrastrar, la foto igual acompaña al cursor (mismo gesto que la tarjeta de la grilla).
    if (!inicio) {
      if (evento.pointerType === 'touch') return;
      const caja = evento.currentTarget.getBoundingClientRect();
      const x = (evento.clientX - caja.left) / caja.width - 0.5;
      const y = (evento.clientY - caja.top) / caja.height - 0.5;
      setGiro({ x: -y * 14, y: x * 14 });
      return;
    }
    girarCon(evento.clientX - inicio.x, evento.clientY - inicio.y);
  }

  function soltarPuntero() {
    inicioArrastre.current = null;
    setArrastrando(false);
  }

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
    <div
      data-tema="carta"
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/70 p-0 backdrop-blur-md sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onCerrar}
        className="absolute inset-0 cursor-default"
      />

      <div className="animate-scale-in relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-(--carta-superficie) shadow-2xl sm:rounded-3xl md:flex-row">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-(--carta-superficie)/85 text-(--carta-suave) shadow-sm backdrop-blur transition-colors hover:bg-(--carta-superficie) hover:text-(--carta-texto)"
        >
          <X className="h-4.5 w-4.5" />
        </button>

        {/* Escenario 3D de la foto */}
        <div
          className="relative flex shrink-0 items-center justify-center overflow-hidden bg-(--carta-elevado) p-8 md:w-1/2 md:p-12"
          style={{ perspective: '1100px' }}
          onPointerDown={alBajarPuntero}
          onPointerMove={alMoverPuntero}
          onPointerUp={soltarPuntero}
          onPointerLeave={() => {
            soltarPuntero();
            setGiro({ x: 0, y: 0 });
          }}
        >
          <div
            aria-hidden="true"
            className="animar-latido absolute h-56 w-56 rounded-full bg-(--carta-acento)/15 blur-3xl"
          />

          <div
            className="relative touch-none will-change-transform"
            style={{
              transform: `rotateX(${giro.x.toFixed(2)}deg) rotateY(${giro.y.toFixed(2)}deg)`,
              transformStyle: 'preserve-3d',
              transition: arrastrando ? 'none' : 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div className="aspect-square w-56 overflow-hidden rounded-full shadow-2xl shadow-black/40 ring-8 ring-(--carta-fondo) sm:w-72">
              {imagen ? (
                <img
                  src={imagen}
                  alt={producto.nombre}
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-(--carta-elevado) text-(--carta-suave)">
                  <UtensilsCrossed className="h-16 w-16" strokeWidth={1} />
                </div>
              )}
            </div>

            {/* Capas flotando por delante del plato: dan la sensación de volumen real. */}
            <span
              className="absolute top-0 left-0 rounded-full bg-(--carta-superficie) px-3 py-1.5 text-xs font-bold text-(--carta-acento) shadow-lg"
              style={{ transform: 'translateZ(24px)' }}
            >
              {producto.categoria.nombre}
            </span>
            <span
              className="absolute right-0 bottom-0 rounded-2xl bg-(--carta-texto) px-4 py-2 text-lg font-bold text-(--carta-fondo) shadow-xl"
              style={{ transform: 'translateZ(30px)' }}
            >
              {formatearPrecio(producto.precio)}
            </span>
          </div>

          {!movimientoReducido && (
            <p className="pointer-events-none absolute bottom-4 flex items-center gap-1.5 text-xs font-medium text-(--carta-suave)">
              <RotateCcw className="h-3.5 w-3.5" />
              Arrastra la foto para girarla
            </p>
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
      </div>
    </div>
  );
}
