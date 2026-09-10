import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, UtensilsCrossed } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import { useMovimientoReducido } from '../../hooks/animacion';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

const INTERVALO_AUTOAVANCE_MS = 4200;
const UMBRAL_DESLIZAR_PX = 40;

interface CarruselPlatillosProps {
  productos: Producto[];
  items: ItemBandeja[];
  onAgregar: (productoId: string) => void;
  /** Abre la ficha ampliada del platillo que está al frente. */
  onVerDetalle: (producto: Producto) => void;
}

/**
 * Vitrina en perspectiva: el plato activo va de frente y los vecinos se inclinan hacia los
 * costados (transformaciones CSS sobre las mismas fotos, no un visor de modelos 3D). Avanza
 * solo, se detiene mientras el cursor está encima o el foco dentro, y con
 * `prefers-reduced-motion` se queda quieto mostrando únicamente el plato activo.
 * Con menos de dos platos no se renderiza: un carrusel de uno no tiene vecinos que mostrar.
 */
export function CarruselPlatillos({
  productos,
  items,
  onAgregar,
  onVerDetalle,
}: CarruselPlatillosProps) {
  const [activo, setActivo] = useState(0);
  const [pausado, setPausado] = useState(false);
  const movimientoReducido = useMovimientoReducido();
  const inicioDeslizar = useRef<number | null>(null);

  const total = productos.length;

  useEffect(() => {
    if (movimientoReducido || pausado || total < 2) return;
    const id = setInterval(() => {
      setActivo((previo) => (previo + 1) % total);
    }, INTERVALO_AUTOAVANCE_MS);
    return () => clearInterval(id);
  }, [movimientoReducido, pausado, total]);

  if (total < 2) return null;

  const platilloActivo = productos[activo];
  const cantidadActiva = items.find((item) => item.productoId === platilloActivo.id)?.cantidad ?? 0;

  function ir(indice: number) {
    setActivo(((indice % total) + total) % total);
  }

  function alTocarInicio(evento: React.TouchEvent) {
    inicioDeslizar.current = evento.touches[0].clientX;
  }

  function alTocarFin(evento: React.TouchEvent) {
    if (inicioDeslizar.current === null) return;
    const delta = evento.changedTouches[0].clientX - inicioDeslizar.current;
    if (delta > UMBRAL_DESLIZAR_PX) ir(activo - 1);
    else if (delta < -UMBRAL_DESLIZAR_PX) ir(activo + 1);
    inicioDeslizar.current = null;
  }

  return (
    <div
      role="region"
      aria-roledescription="carrusel"
      aria-label="Platos recomendados"
      className="select-none"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={() => setPausado(false)}
    >
      <div
        className="relative h-72 sm:h-[26rem]"
        style={{ perspective: '1500px' }}
        onTouchStart={alTocarInicio}
        onTouchEnd={alTocarFin}
      >
        {productos.map((producto, indice) => {
          let distancia = indice - activo;
          if (distancia > total / 2) distancia -= total;
          if (distancia < -total / 2) distancia += total;

          const alFrente = distancia === 0;
          const visible = Math.abs(distancia) <= 2;
          const imagen = urlImagen(producto.imagenUrl);

          const transform = movimientoReducido
            ? alFrente
              ? 'none'
              : 'scale(0)'
            : `translateX(${distancia * 56}%) translateZ(${-Math.abs(distancia) * 170}px) rotateY(${distancia * -32}deg)`;

          return (
            <button
              key={producto.id}
              type="button"
              onClick={() => (alFrente ? onVerDetalle(producto) : ir(indice))}
              aria-label={alFrente ? `Ver ${producto.nombre} en detalle` : `Ver ${producto.nombre}`}
              aria-current={alFrente}
              tabIndex={visible ? undefined : -1}
              className="absolute inset-0 mx-auto w-52 origin-center cursor-pointer rounded-3xl focus-visible:outline-none sm:w-72"
              style={{
                transform,
                zIndex: 10 - Math.abs(distancia),
                opacity: visible ? (alFrente ? 1 : 0.4) : 0,
                pointerEvents: visible ? 'auto' : 'none',
                transformStyle: 'preserve-3d',
                transition: movimientoReducido
                  ? 'opacity 0.2s ease-out'
                  : 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease-out',
              }}
            >
              <div
                className={`aspect-square overflow-hidden rounded-3xl bg-(--carta-elevado) transition-shadow duration-500 ${
                  alFrente ? 'shadow-2xl shadow-black/15' : 'shadow-lg shadow-black/5'
                }`}
              >
                {imagen ? (
                  <img
                    src={imagen}
                    alt={alFrente ? producto.nombre : ''}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-(--carta-suave)">
                    <UtensilsCrossed className="h-10 w-10" strokeWidth={1.25} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Ficha del plato al frente. La `key` fuerza el remonte para que el texto vuelva a
          entrar animado en cada cambio, en vez de sustituirse de golpe. */}
      <div key={platilloActivo.id} className="animar-revelar mx-auto mt-7 max-w-sm text-center">
        <h3 className="text-lg font-semibold tracking-tight">{platilloActivo.nombre}</h3>
        <p className="mt-1 text-lg font-semibold text-(--carta-acento) tabular-nums">
          {formatearPrecio(platilloActivo.precio)}
        </p>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => ir(activo - 1)}
          aria-label="Plato anterior"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-(--carta-borde) bg-(--carta-superficie) transition-colors hover:bg-(--carta-elevado)"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => onAgregar(platilloActivo.id)}
          className="flex items-center gap-1.5 rounded-xl bg-(--carta-acento) px-5 py-3 text-sm font-semibold text-(--carta-acento-contraste) transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          {cantidadActiva > 0 ? `En tu pedido (${cantidadActiva})` : 'Agregar'}
        </button>
        <button
          type="button"
          onClick={() => ir(activo + 1)}
          aria-label="Siguiente plato"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-(--carta-borde) bg-(--carta-superficie) transition-colors hover:bg-(--carta-elevado)"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-6 flex justify-center gap-1.5">
        {productos.map((producto, indice) => (
          <button
            key={producto.id}
            type="button"
            onClick={() => ir(indice)}
            aria-label={`Ir a ${producto.nombre}`}
            aria-current={indice === activo}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              indice === activo
                ? 'w-7 bg-(--carta-acento)'
                : 'w-1.5 bg-(--carta-borde) hover:bg-(--carta-suave)'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
