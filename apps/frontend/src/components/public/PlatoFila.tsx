import { Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import type { Producto } from '../../types/api';

interface PlatoFilaProps {
  producto: Producto;
  cantidadEnBandeja: number;
  onAgregar: () => void;
  onQuitarUna: () => void;
  onVerDetalle: () => void;
  /** Alterna el lado de la foto para que dos filas seguidas no se lean como una plantilla. */
  invertida?: boolean;
}

/**
 * Presentación a ancho completo de un plato: foto grande a un lado, datos al otro. Se usa
 * cuando una categoría tiene uno o dos platos, donde la grilla de tres columnas dejaría
 * huecos vacíos y la página parecería a medio cargar. Con pocos productos, mostrar cada uno
 * en grande se ve intencional; repartirlos en una grilla ancha, no.
 */
export function PlatoFila({
  producto,
  cantidadEnBandeja,
  onAgregar,
  onQuitarUna,
  onVerDetalle,
  invertida = false,
}: PlatoFilaProps) {
  const imagen = urlImagen(producto.imagenUrl);
  const enPedido = cantidadEnBandeja > 0;

  return (
    <article className="group grid overflow-hidden rounded-3xl border border-(--carta-borde) bg-(--carta-superficie) transition-shadow duration-500 hover:shadow-2xl hover:shadow-black/5 md:grid-cols-[3fr_2fr]">
      <button
        type="button"
        onClick={onVerDetalle}
        aria-label={`Ver ${producto.nombre} en detalle`}
        className={`relative min-h-64 overflow-hidden bg-(--carta-elevado) md:min-h-96 ${
          invertida ? 'md:order-2' : ''
        }`}
      >
        {imagen ? (
          <img
            src={imagen}
            alt={producto.nombre}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-1200 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-(--carta-suave)">
            <UtensilsCrossed className="h-12 w-12" strokeWidth={1} />
          </div>
        )}
      </button>

      <div className="flex flex-col justify-center p-7 sm:p-10">
        <p className="text-xs font-semibold tracking-[0.18em] text-(--carta-acento) uppercase">
          {producto.categoria.nombre}
        </p>
        <h3 className="mt-4 text-3xl leading-[1.1] font-semibold tracking-tight sm:text-4xl">
          {producto.nombre}
        </h3>

        {producto.descripcion && (
          <p className="mt-4 max-w-prose leading-relaxed text-(--carta-suave)">
            {producto.descripcion}
          </p>
        )}

        <p className="mt-6 text-3xl font-semibold tabular-nums">
          {formatearPrecio(producto.precio)}
        </p>

        <div className="mt-7">
          {enPedido ? (
            <div className="inline-flex items-center gap-4 rounded-xl border border-(--carta-borde) p-1.5">
              <button
                type="button"
                onClick={onQuitarUna}
                aria-label={`Quitar una unidad de ${producto.nombre}`}
                className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-(--carta-elevado) active:scale-95"
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <span className="min-w-6 text-center text-base font-semibold tabular-nums">
                {cantidadEnBandeja}
              </span>
              <button
                type="button"
                onClick={onAgregar}
                aria-label={`Agregar una unidad más de ${producto.nombre}`}
                className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-(--carta-elevado) active:scale-95"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAgregar}
              className="inline-flex items-center gap-2 rounded-xl bg-(--carta-acento) px-7 py-3.5 text-sm font-semibold text-(--carta-acento-contraste) transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Agregar al pedido
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
