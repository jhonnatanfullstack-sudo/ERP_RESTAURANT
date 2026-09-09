import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, UtensilsCrossed } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import { useMovimientoReducido } from '../../hooks/animacion';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

const INTERVALO_AUTOAVANCE_MS = 4500;
const UMBRAL_DESLIZAR_PX = 40;

interface CarruselPlatillosProps {
  productos: Producto[];
  items: ItemBandeja[];
  onAgregar: (productoId: string) => void;
}

/**
 * Vitrina "coverflow" de platillos: el plato activo queda de frente y grande, los vecinos
 * se inclinan en perspectiva hacia los costados — es 3D real (transformaciones CSS sobre
 * las fotos ya existentes), no un visor de modelos `.glb` (eso necesita contenido 3D que el
 * proyecto no tiene, ver `decisiones-tecnicas.md`). Con menos de 2 platillos no se renderiza
 * nada: un coverflow de un solo elemento no tiene vecinos que mostrar.
 */
export function CarruselPlatillos({ productos, items, onAgregar }: CarruselPlatillosProps) {
  const [activo, setActivo] = useState(0);
  const movimientoReducido = useMovimientoReducido();
  const inicioDeslizar = useRef<number | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const total = productos.length;

  useEffect(() => {
    if (movimientoReducido || total < 2) return;
    const id = setInterval(() => {
      setActivo((previo) => (previo + 1) % total);
    }, INTERVALO_AUTOAVANCE_MS);
    return () => clearInterval(id);
  }, [movimientoReducido, total]);

  if (total < 2) return null;

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

  const platilloActivo = productos[activo];
  const cantidadActiva = items.find((item) => item.productoId === platilloActivo.id)?.cantidad ?? 0;

  return (
    <div
      className="select-none"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Platillos de la carta"
    >
      <div
        ref={contenedorRef}
        className="relative h-72 sm:h-80"
        style={{ perspective: '1400px' }}
        onTouchStart={alTocarInicio}
        onTouchEnd={alTocarFin}
      >
        {productos.map((producto, indice) => {
          let distancia = indice - activo;
          if (distancia > total / 2) distancia -= total;
          if (distancia < -total / 2) distancia += total;

          const visible = Math.abs(distancia) <= 2;
          const imagen = urlImagen(producto.imagenUrl);

          const transform = movimientoReducido
            ? distancia === 0
              ? 'none'
              : 'translateX(0) scale(0)'
            : `translateX(${distancia * 62}%) translateZ(${-Math.abs(distancia) * 140}px) rotateY(${distancia * -38}deg) scale(${1 - Math.abs(distancia) * 0.18})`;

          return (
            <button
              key={producto.id}
              type="button"
              onClick={() => ir(indice)}
              aria-label={`Ver ${producto.nombre}`}
              aria-current={distancia === 0}
              className="absolute inset-0 mx-auto w-48 origin-center cursor-pointer sm:w-60"
              style={{
                transform,
                zIndex: 10 - Math.abs(distancia),
                opacity: visible ? (distancia === 0 ? 1 : 0.55) : 0,
                pointerEvents: distancia === 0 ? 'none' : visible ? 'auto' : 'none',
                transformStyle: 'preserve-3d',
                transition: movimientoReducido
                  ? 'opacity 0.2s ease-out'
                  : 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease-out',
              }}
            >
              <div className="aspect-square overflow-hidden rounded-3xl bg-zinc-800 shadow-2xl shadow-black/40 ring-1 ring-white/10">
                {imagen ? (
                  <img
                    src={imagen}
                    alt={distancia === 0 ? producto.nombre : ''}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-zinc-700 text-zinc-400">
                    <UtensilsCrossed className="h-10 w-10" strokeWidth={1.25} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Ficha del platillo activo + acciones */}
      <div className="animate-fade-in mx-auto mt-6 max-w-xs text-center" key={platilloActivo.id}>
        <p className="text-xs font-semibold tracking-wide text-orange-200 uppercase">
          {platilloActivo.categoria.nombre}
        </p>
        <h3 className="mt-1 text-xl font-bold text-white">{platilloActivo.nombre}</h3>
        <p className="mt-1 text-lg font-bold text-orange-300">
          {formatearPrecio(platilloActivo.precio)}
        </p>

        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => ir(activo - 1)}
            aria-label="Platillo anterior"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onAgregar(platilloActivo.id)}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-orange-700 shadow-lg transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            {cantidadActiva > 0 ? `En tu pedido (${cantidadActiva})` : 'Agregar a mi pedido'}
          </button>
          <button
            type="button"
            onClick={() => ir(activo + 1)}
            aria-label="Siguiente platillo"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-5 flex justify-center gap-1.5">
        {productos.map((producto, indice) => (
          <button
            key={producto.id}
            type="button"
            onClick={() => ir(indice)}
            aria-label={`Ir a ${producto.nombre}`}
            aria-current={indice === activo}
            className={`h-1.5 rounded-full transition-all ${
              indice === activo ? 'w-6 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/60'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
