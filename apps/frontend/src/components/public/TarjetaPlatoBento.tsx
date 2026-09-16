import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Plus, UtensilsCrossed } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import type { Producto } from '../../types/api';

const EASE_PREMIUM = [0.4, 0, 0.2, 1] as const;
/** Cuánto dura el acuse visual de "agregado" antes de volver al estado normal. */
const MS_CONFIRMACION = 900;

export type TamanoTarjeta = 'grande' | 'normal';

interface TarjetaPlatoBentoProps {
  producto: Producto;
  tamano: TamanoTarjeta;
  /** Posición dentro de su grilla: solo para escalonar la entrada, no cambia el tamaño. */
  indice: number;
  cantidad: number;
  /** Sin pedidos habilitados no se pinta el botón "+": la carta queda de solo lectura. */
  permitirPedidos: boolean;
  onAgregar: () => void;
  onVerDetalle: () => void;
}

/**
 * Tesela del grid bento: una foto a sangre con el nombre y el precio flotando abajo en un
 * degradado, más un botón "+" independiente arriba a la derecha. Es la unidad que se repite en
 * toda la carta pública —destacados y cada categoría— para que el lenguaje visual sea el mismo
 * en toda la página en vez de tener una lista y una grilla con tratamientos distintos.
 */
export function TarjetaPlatoBento({
  producto,
  tamano,
  indice,
  cantidad,
  permitirPedidos,
  onAgregar,
  onVerDetalle,
}: TarjetaPlatoBentoProps) {
  const [confirmando, setConfirmando] = useState(false);
  const imagen = urlImagen(producto.imagenUrl);
  const grande = tamano === 'grande';

  function manejarAgregar(evento: React.MouseEvent) {
    evento.stopPropagation();
    onAgregar();
    setConfirmando(true);
    window.setTimeout(() => setConfirmando(false), MS_CONFIRMACION);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.4, ease: EASE_PREMIUM, delay: Math.min(indice * 0.035, 0.3) }}
      whileHover={{ y: -4 }}
      className={`group relative overflow-hidden rounded-3xl bg-(--carta-elevado) shadow-sm shadow-black/5 ${
        grande ? 'col-span-2 row-span-2' : 'col-span-1 row-span-1'
      }`}
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
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-(--carta-suave)">
            <UtensilsCrossed className={grande ? 'h-14 w-14' : 'h-8 w-8'} strokeWidth={1.25} />
          </div>
        )}

        {/* Degradado inferior: hace legible el texto sobre cualquier foto, prolija o no. */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-3.5 text-left text-white sm:p-4">
          <p
            className={`line-clamp-2 leading-snug font-semibold tracking-tight ${
              grande ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'
            }`}
          >
            {producto.nombreCompleto}
          </p>
          {/* La descripción solo entra en la tesela grande: en una normal no hay espacio y se
              recorta antes de decir algo útil. */}
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
        <button
          type="button"
          onClick={manejarAgregar}
          aria-label={
            cantidad > 0
              ? `Agregar una unidad más de ${producto.nombreCompleto}`
              : `Agregar ${producto.nombreCompleto} al pedido`
          }
          className={`absolute top-3 right-3 flex items-center justify-center rounded-full shadow-lg backdrop-blur transition-transform active:scale-90 ${
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
      )}
    </motion.div>
  );
}
