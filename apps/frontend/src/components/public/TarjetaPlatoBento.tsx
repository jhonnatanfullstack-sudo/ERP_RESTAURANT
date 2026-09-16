import { useState } from 'react';
import { Check, Plus, UtensilsCrossed } from 'lucide-react';
import { useTilt3D } from '../../hooks/useTilt3D';
import { useRevelarEnScroll } from '../../hooks/useRevelarEnScroll';
import { useMovimientoReducido } from '../../hooks/animacion';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import type { Producto } from '../../types/api';

/** Cuánto dura el acuse visual de "agregado" antes de volver al estado normal. */
const MS_CONFIRMACION = 900;

export type TamanoTarjeta = 'grande' | 'normal';

interface TarjetaPlatoBentoProps {
  producto: Producto;
  tamano: TamanoTarjeta;
  cantidad: number;
  /** Sin pedidos habilitados no se pinta el botón "+": la carta queda de solo lectura. */
  permitirPedidos: boolean;
  onAgregar: () => void;
  onVerDetalle: () => void;
}

/**
 * Tesela del grid bento: una foto a sangre que se inclina en 3D siguiendo al puntero, con el
 * nombre, el precio y el botón "+" flotando por delante en capas a distinta profundidad. Es la
 * unidad que se repite en toda la carta pública —destacados y cada categoría— para que el
 * lenguaje visual sea el mismo en toda la página.
 *
 * El giro y el reflejo son CSS puro alimentado por `useTilt3D` (ver index.css): nada de esto
 * pasa por React ni por una librería de animación, así que una grilla con decenas de platos
 * sigue costando lo mismo que antes.
 */
export function TarjetaPlatoBento({
  producto,
  tamano,
  cantidad,
  permitirPedidos,
  onAgregar,
  onVerDetalle,
}: TarjetaPlatoBentoProps) {
  const [confirmando, setConfirmando] = useState(false);
  const { ref, alMover, alSalir } = useTilt3D();
  // Ref propio (en el envoltorio exterior, no en el que gira) para no tener que fusionarlo
  // con el de `useTilt3D`. Ver useRevelarEnScroll.ts: por qué no es un IntersectionObserver.
  const { ref: refRevelado, revelado } = useRevelarEnScroll<HTMLDivElement>();
  // Con menos movimiento, el plato se ve directo: nada que ocultar mientras se espera al
  // scroll ni fundido que reproducir.
  const movimientoReducido = useMovimientoReducido();
  const mostrar = revelado || movimientoReducido;
  const imagen = urlImagen(producto.imagenUrl);
  const grande = tamano === 'grande';

  function manejarAgregar(evento: React.MouseEvent) {
    evento.stopPropagation();
    onAgregar();
    setConfirmando(true);
    window.setTimeout(() => setConfirmando(false), MS_CONFIRMACION);
  }

  return (
    // `escena-3d` aporta la perspectiva y el hijo es el que gira: aplicar ambas cosas al
    // mismo nodo haría que la perspectiva se calcule desde su propio centro ya rotado, y el
    // giro se vería plano.
    <div
      ref={refRevelado}
      className={`escena-3d transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none ${mostrar ? 'opacity-100' : 'opacity-0 [translate:0_20px]'} ${grande ? 'col-span-2 row-span-2' : 'col-span-1 row-span-1'}`}
      onPointerMove={alMover}
      onPointerLeave={alSalir}
    >
      <div
        ref={ref}
        className="tarjeta-3d group relative h-full w-full overflow-hidden rounded-3xl bg-(--carta-elevado) shadow-sm shadow-black/5 transition-shadow duration-500 hover:shadow-2xl hover:shadow-black/20"
      >
        <button
          type="button"
          onClick={onVerDetalle}
          aria-label={`Ver ${producto.nombreCompleto} en detalle`}
          className="absolute inset-0 h-full w-full focus-visible:outline-none"
        >
          {imagen ? (
            <img
              src={imagen}
              alt={producto.nombre}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-(--carta-suave)">
              <UtensilsCrossed className={grande ? 'h-14 w-14' : 'h-8 w-8'} strokeWidth={1.25} />
            </div>
          )}

          {/* Degradado inferior: hace legible el texto sobre cualquier foto, prolija o no.
              Cubre solo la franja del texto y se apaga rápido: extendido hasta dos tercios de
              la tesela, sobre una foto de fondo claro (una botella recortada en blanco,
              típica de las bebidas) se leía como una mancha gris encima del producto. */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* Reflejo especular que sigue al puntero. */}
          <div className="tarjeta-3d__brillo absolute inset-0" />

          <div
            className="tarjeta-3d__capa absolute inset-x-0 bottom-0 p-3.5 text-left text-white sm:p-4"
            style={{ '--profundidad': '38px' } as React.CSSProperties}
          >
            <p
              className={`line-clamp-2 leading-snug font-semibold tracking-tight ${
                grande ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'
              }`}
            >
              {producto.nombreCompleto}
            </p>
            {/* La descripción solo entra en la tesela grande: en una normal no hay espacio y
                se recorta antes de decir algo útil. */}
            {grande && producto.descripcion && (
              <p className="mt-1 line-clamp-2 text-xs text-white/75 sm:text-sm">
                {producto.descripcion}
              </p>
            )}
            <p
              className={`mt-1 font-medium text-white/90 ${grande ? 'text-base' : 'text-xs sm:text-sm'}`}
            >
              {formatearPrecio(producto.precio)}
            </p>
          </div>
        </button>

        {permitirPedidos && (
          // Va más adelante que el texto: es el elemento con el que se interactúa, así que es
          // el que más se despega de la foto al girar la tarjeta.
          <div
            className="tarjeta-3d__capa absolute top-3 right-3"
            style={{ '--profundidad': '58px' } as React.CSSProperties}
          >
            <button
              type="button"
              onClick={manejarAgregar}
              aria-label={
                cantidad > 0
                  ? `Agregar una unidad más de ${producto.nombreCompleto}`
                  : `Agregar ${producto.nombreCompleto} al pedido`
              }
              className={`pointer-events-auto flex items-center justify-center rounded-full shadow-lg backdrop-blur transition-transform hover:scale-110 active:scale-90 ${
                confirmando
                  ? 'animar-agregado bg-(--carta-acento) text-(--carta-acento-contraste)'
                  : 'bg-white/95 text-(--carta-texto)'
              } ${grande ? 'h-10 w-10' : 'h-8 w-8'}`}
            >
              {confirmando ? (
                <Check className={grande ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5'} strokeWidth={2.5} />
              ) : cantidad > 0 ? (
                <span
                  className={`font-bold text-(--carta-acento) tabular-nums ${grande ? 'text-sm' : 'text-xs'}`}
                >
                  {cantidad}
                </span>
              ) : (
                <Plus className={grande ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5'} strokeWidth={2.5} />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
