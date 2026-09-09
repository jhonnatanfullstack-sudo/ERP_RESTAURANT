import { Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import { useInclinacion3D } from '../../hooks/useInclinacion3D';
import type { Producto } from '../../types/api';

interface ProductoCartaProps {
  producto: Producto;
  /** Cuántas unidades tiene ya el cliente en su pedido de WhatsApp (0 si ninguna). */
  cantidadEnBandeja: number;
  onAgregar: () => void;
  onQuitarUna: () => void;
  /** Retraso de entrada en ms, para escalonar la aparición de la grilla. */
  retraso?: number;
}

/**
 * Tarjeta de producto de la carta pública. A diferencia de la tarjeta administrativa de
 * `Productos.tsx` (solo lectura para el staff), esta permite sumar/restar unidades al
 * pedido informal que se envía por WhatsApp — ver `hooks/useBandejaPedido.ts`.
 */
export function ProductoCarta({
  producto,
  cantidadEnBandeja,
  onAgregar,
  onQuitarUna,
  retraso = 0,
}: ProductoCartaProps) {
  const imagen = urlImagen(producto.imagenUrl);
  const {
    ref: refFoto,
    estilo: estiloInclinado,
    alMoverPuntero,
    alSalirPuntero,
  } = useInclinacion3D(8);

  return (
    <div
      className="animar-entrada group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-orange-900/5"
      style={{ animationDelay: `${retraso}ms` }}
    >
      {/* La inclinación 3D solo vive en la foto (perspective + rotateX/rotateY según el
          cursor) — el resto de la tarjeta (precio, botón) queda plano y legible. */}
      <div
        ref={refFoto}
        onPointerMove={alMoverPuntero}
        onPointerLeave={alSalirPuntero}
        className="relative aspect-4/3 overflow-hidden bg-zinc-100"
        style={{ perspective: '600px' }}
      >
        <div
          className="h-full w-full transition-transform duration-150 ease-out will-change-transform"
          style={estiloInclinado}
        >
          {imagen ? (
            <img
              src={imagen}
              alt={producto.nombre}
              loading="lazy"
              className="h-full w-full scale-105 object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-300">
              <UtensilsCrossed className="h-10 w-10" strokeWidth={1.25} />
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-zinc-600 shadow-sm backdrop-blur">
          {producto.categoria.nombre}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-zinc-900">{producto.nombre}</h3>
          <span className="shrink-0 text-lg font-bold text-orange-600">
            {formatearPrecio(producto.precio)}
          </span>
        </div>
        {producto.descripcion && (
          <p className="mt-1.5 line-clamp-2 text-sm text-zinc-500">{producto.descripcion}</p>
        )}

        <div className="mt-3.5 flex-1" />

        {cantidadEnBandeja === 0 ? (
          <button
            type="button"
            onClick={onAgregar}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 active:scale-95"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Agregar a mi pedido
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-orange-50 p-1.5 ring-1 ring-orange-100">
            <button
              type="button"
              onClick={onQuitarUna}
              aria-label={`Quitar una unidad de ${producto.nombre}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-orange-700 shadow-sm transition-transform active:scale-90"
            >
              <Minus className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <span className="text-sm font-bold text-orange-700 tabular-nums">
              {cantidadEnBandeja} en tu pedido
            </span>
            <button
              type="button"
              onClick={onAgregar}
              aria-label={`Agregar una unidad más de ${producto.nombre}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-orange-700 shadow-sm transition-transform active:scale-90"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
