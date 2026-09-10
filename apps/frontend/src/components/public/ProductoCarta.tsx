import { useState } from 'react';
import { Check, Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import type { Producto } from '../../types/api';

/** Cuánto dura el acuse visual de "agregado" antes de volver al estado normal. */
const MS_CONFIRMACION = 900;

interface ProductoCartaProps {
  producto: Producto;
  /** Cuántas unidades tiene ya el cliente en su pedido de WhatsApp (0 si ninguna). */
  cantidadEnBandeja: number;
  onAgregar: () => void;
  onQuitarUna: () => void;
  /** Abre la ficha ampliada del platillo (`ModalPlatillo`). */
  onVerDetalle: () => void;
  /** Retraso de entrada en ms, para escalonar la aparición de la grilla. */
  retraso?: number;
}

/**
 * Plato de la carta pública, en la misma tarjeta blanca sobre fondo zinc que usa el panel
 * administrativo, para que cliente y staff vean un solo producto. La foto manda (es lo que
 * decide una compra de comida): ocupa el borde superior completo y se acerca al pasar el
 * mouse, mientras la tarjeta se eleva. La foto abre la ficha ampliada; los botones de
 * cantidad son elementos aparte, así que no la disparan al pulsarlos.
 */
export function ProductoCarta({
  producto,
  cantidadEnBandeja,
  onAgregar,
  onQuitarUna,
  onVerDetalle,
  retraso = 0,
}: ProductoCartaProps) {
  const imagen = urlImagen(producto.imagenUrl);
  const enPedido = cantidadEnBandeja > 0;
  // Acuse de recibo del clic: sin esto, agregar un plato solo cambia un número pequeño y el
  // cliente no sabe si el toque registró.
  const [confirmando, setConfirmando] = useState(false);

  function agregarConAcuse() {
    onAgregar();
    setConfirmando(true);
    window.setTimeout(() => setConfirmando(false), MS_CONFIRMACION);
  }

  return (
    <article
      className={`animar-entrada group flex flex-col overflow-hidden rounded-2xl border bg-(--carta-superficie) transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5 ${
        confirmando
          ? 'animar-agregado border-(--carta-acento)'
          : 'border-(--carta-borde) hover:border-(--carta-acento)/30'
      }`}
      style={{ animationDelay: `${retraso}ms` }}
    >
      <button
        type="button"
        onClick={onVerDetalle}
        aria-label={`Ver ${producto.nombre} en detalle`}
        className="relative block w-full overflow-hidden bg-(--carta-elevado) focus-visible:ring-2 focus-visible:ring-(--carta-acento) focus-visible:outline-none"
      >
        <div className="aspect-5/4 w-full">
          {imagen ? (
            <img
              src={imagen}
              alt={producto.nombre}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-900 ease-out group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-(--carta-suave)">
              <UtensilsCrossed className="h-8 w-8" strokeWidth={1.25} />
            </div>
          )}
        </div>

        {enPedido && (
          <span className="absolute top-3 left-3 rounded-lg bg-(--carta-acento) px-2 py-1 text-xs font-bold text-(--carta-acento-contraste) tabular-nums">
            {cantidadEnBandeja} en tu pedido
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-[15px] leading-snug font-semibold tracking-tight">
            {producto.nombre}
          </h3>
          <span className="shrink-0 text-[15px] font-semibold tabular-nums">
            {formatearPrecio(producto.precio)}
          </span>
        </div>

        {producto.descripcion && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-(--carta-suave)">
            {producto.descripcion}
          </p>
        )}

        <div className="flex-1 pt-4" />

        {enPedido ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-(--carta-borde) p-1.5">
            <button
              type="button"
              onClick={onQuitarUna}
              aria-label={`Quitar una unidad de ${producto.nombre}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-(--carta-texto) transition-colors hover:bg-(--carta-elevado) active:scale-95"
            >
              <Minus className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <span className="text-sm font-semibold tabular-nums">{cantidadEnBandeja}</span>
            <button
              type="button"
              onClick={onAgregar}
              aria-label={`Agregar una unidad más de ${producto.nombre}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-(--carta-texto) transition-colors hover:bg-(--carta-elevado) active:scale-95"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={agregarConAcuse}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition-all active:translate-y-px ${
              confirmando
                ? 'border-(--carta-acento) bg-(--carta-acento) text-(--carta-acento-contraste)'
                : 'border-(--carta-borde) hover:border-(--carta-acento) hover:text-(--carta-acento)'
            }`}
          >
            {confirmando ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2.5} />
                Agregado
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Agregar
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}
