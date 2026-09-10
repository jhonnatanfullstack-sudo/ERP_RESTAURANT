import { Plus, UtensilsCrossed } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import { useEnVista } from '../../hooks/useEnVista';
import type { Producto } from '../../types/api';

interface PlatoDestacadoProps {
  producto: Producto;
  cantidadEnBandeja: number;
  onAgregar: () => void;
  onVerDetalle: () => void;
}

/**
 * Bloque a media página con un solo plato: rompe el ritmo de la grilla y le da a una foto el
 * tamaño que merece. La imagen se desplaza dentro de su marco mientras la sección cruza la
 * pantalla (parallax por `animation-timeline: view()`, sin JS escuchando el scroll).
 */
export function PlatoDestacado({
  producto,
  cantidadEnBandeja,
  onAgregar,
  onVerDetalle,
}: PlatoDestacadoProps) {
  const { ref, visible } = useEnVista<HTMLDivElement>();
  const imagen = urlImagen(producto.imagenUrl);

  return (
    <section className="border-y border-(--carta-borde) bg-(--carta-superficie)">
      <div
        ref={ref}
        className={`mx-auto grid max-w-6xl items-stretch gap-0 transition-all duration-700 ease-out lg:grid-cols-2 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
        }`}
      >
        <div className="relative min-h-72 overflow-hidden lg:min-h-120">
          {imagen ? (
            <img
              src={imagen}
              alt={producto.nombre}
              loading="lazy"
              className="animar-parallax absolute inset-0 h-full w-full scale-[1.12] object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-(--carta-elevado) text-(--carta-suave)">
              <UtensilsCrossed className="h-12 w-12" strokeWidth={1} />
            </div>
          )}
        </div>

        <div className="flex flex-col justify-center px-5 py-12 sm:px-10 lg:py-16">
          <p className="text-xs font-semibold tracking-[0.18em] text-(--carta-acento) uppercase">
            {producto.categoria.nombre}
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {producto.nombre}
          </h2>
          {/* Sin descripción real no se inventa una: un texto genérico acá sería una promesa
              sobre un producto concreto que el restaurante no escribió. */}
          {producto.descripcion && (
            <p className="mt-4 max-w-md leading-relaxed text-(--carta-suave)">
              {producto.descripcion}
            </p>
          )}

          <p className="mt-8 text-4xl font-semibold tabular-nums">
            {formatearPrecio(producto.precio)}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onAgregar}
              className="flex items-center gap-2 rounded-xl bg-(--carta-acento) px-6 py-3.5 text-sm font-semibold text-(--carta-acento-contraste) transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              {cantidadEnBandeja > 0 ? `En tu pedido (${cantidadEnBandeja})` : 'Agregar al pedido'}
            </button>
            <button
              type="button"
              onClick={onVerDetalle}
              className="rounded-xl border border-(--carta-borde) px-6 py-3.5 text-sm font-semibold transition-colors hover:bg-(--carta-elevado)"
            >
              Ver detalle
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
