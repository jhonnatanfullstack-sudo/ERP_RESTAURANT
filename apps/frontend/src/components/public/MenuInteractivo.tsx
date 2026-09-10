import { useState } from 'react';
import { ArrowUpRight, Check, Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

/** Cuánto dura el acuse visual de "agregado" antes de volver al estado normal. */
const MS_CONFIRMACION = 900;

export interface GrupoCategoria {
  categoria: { id: string; nombre: string };
  productos: Producto[];
}

interface MenuInteractivoProps {
  grupos: GrupoCategoria[];
  items: ItemBandeja[];
  onAgregar: (productoId: string) => void;
  onQuitarUna: (productoId: string, cantidadActual: number) => void;
  onVerDetalle: (producto: Producto) => void;
  /** Registra el nodo de cada categoría para el scrollspy de la barra superior. */
  registrarSeccion: (id: string) => (elemento: HTMLElement | null) => void;
  /** Bloque de cierre bajo la lista. Con una carta corta, la columna de la lista queda mucho
   * más baja que el visor y sobra un hueco: acá va algo útil en vez de aire. */
  pie?: React.ReactNode;
}

/**
 * La carta como carta: una lista tipográfica de nombres y precios, no una grilla de tarjetas.
 * Mientras el visitante recorre la lista, el panel fijo de la derecha muestra en grande el
 * plato que está señalando, con foto, descripción y precio.
 *
 * Es la forma en que se lee un menú impreso y resuelve el problema que tenía la grilla: con
 * pocos platos una grilla de tres columnas deja huecos y parece a medio cargar, mientras que
 * una lista se ve igual de intencional con dos platos que con doscientos.
 *
 * Debajo de `lg` no hay espacio para el visor ni existe el hover: cada fila muestra entonces
 * su propia foto y la lista se comporta como un listado normal.
 */
export function MenuInteractivo({
  grupos,
  items,
  onAgregar,
  onQuitarUna,
  onVerDetalle,
  registrarSeccion,
  pie,
}: MenuInteractivoProps) {
  const todos = grupos.flatMap((grupo) => grupo.productos);
  const [activoId, setActivoId] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const activo = todos.find((producto) => producto.id === activoId) ?? todos[0] ?? null;

  const cantidadDe = (producto: Producto) =>
    items.find((item) => item.productoId === producto.id)?.cantidad ?? 0;

  function agregarConAcuse(producto: Producto) {
    onAgregar(producto.id);
    setConfirmandoId(producto.id);
    window.setTimeout(() => setConfirmandoId(null), MS_CONFIRMACION);
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-20">
      <div className="flex flex-col gap-14">
        {grupos.map((grupo) => (
          <section
            key={grupo.categoria.id}
            ref={registrarSeccion(grupo.categoria.id)}
            data-categoria-id={grupo.categoria.id}
            className="scroll-mt-40"
          >
            <h2 className="text-xs font-semibold tracking-[0.2em] text-(--carta-acento) uppercase">
              {grupo.categoria.nombre}
            </h2>

            <ul className="mt-6">
              {grupo.productos.map((producto) => {
                const cantidad = cantidadDe(producto);
                const enFoco = activo?.id === producto.id;
                const confirmando = confirmandoId === producto.id;
                const imagen = urlImagen(producto.imagenUrl);

                return (
                  <li
                    key={producto.id}
                    onMouseEnter={() => setActivoId(producto.id)}
                    className="border-b border-(--carta-borde) last:border-b-0"
                  >
                    {/* Solo bajo `lg`, donde no existe el visor fijo ni el hover. */}
                    {imagen && (
                      <button
                        type="button"
                        onClick={() => onVerDetalle(producto)}
                        aria-label={`Ver ${producto.nombre} en detalle`}
                        className="mt-6 block aspect-16/10 w-full overflow-hidden rounded-2xl bg-(--carta-elevado) lg:hidden"
                      >
                        <img
                          src={imagen}
                          alt={producto.nombre}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    )}

                    <div className="flex items-center gap-4 py-5">
                      <button
                        type="button"
                        onFocus={() => setActivoId(producto.id)}
                        onClick={() => onVerDetalle(producto)}
                        className="group flex min-w-0 flex-1 items-baseline gap-4 text-left focus-visible:outline-none"
                      >
                        <span
                          className={`truncate text-xl font-semibold tracking-tight transition-all duration-300 sm:text-2xl ${
                            enFoco ? 'lg:translate-x-1.5 lg:text-(--carta-acento)' : ''
                          }`}
                        >
                          {producto.nombre}
                        </span>
                        <ArrowUpRight
                          className={`hidden h-4 w-4 shrink-0 text-(--carta-acento) transition-all duration-300 lg:block ${
                            enFoco ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'
                          }`}
                          strokeWidth={2.5}
                        />
                        {/* Filete de puntos: el recurso clásico de una carta impresa para
                            llevar la vista del nombre hasta su precio. */}
                        <span
                          aria-hidden="true"
                          className="hidden min-w-8 flex-1 translate-y-[-0.3em] border-b border-dotted border-(--carta-borde) sm:block"
                        />
                        <span className="shrink-0 text-lg font-semibold tabular-nums sm:text-xl">
                          {formatearPrecio(producto.precio)}
                        </span>
                      </button>

                      {cantidad > 0 ? (
                        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-(--carta-borde) p-1">
                          <button
                            type="button"
                            onClick={() => onQuitarUna(producto.id, cantidad)}
                            aria-label={`Quitar una unidad de ${producto.nombre}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-(--carta-elevado) active:scale-90"
                          >
                            <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                          <span className="min-w-5 text-center text-sm font-semibold tabular-nums">
                            {cantidad}
                          </span>
                          <button
                            type="button"
                            onClick={() => agregarConAcuse(producto)}
                            aria-label={`Agregar una unidad más de ${producto.nombre}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-(--carta-elevado) active:scale-90"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => agregarConAcuse(producto)}
                          aria-label={`Agregar ${producto.nombre} al pedido`}
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all active:scale-90 ${
                            confirmando
                              ? 'animar-agregado border-(--carta-acento) bg-(--carta-acento) text-(--carta-acento-contraste)'
                              : 'border-(--carta-borde) hover:border-(--carta-acento) hover:text-(--carta-acento)'
                          }`}
                        >
                          {confirmando ? (
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                          ) : (
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                          )}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {pie}
      </div>

      {/* Visor fijo: acompaña el scroll de la lista mostrando el plato señalado. */}
      {activo && (
        <aside className="sticky top-32 hidden lg:block">
          <button
            type="button"
            onClick={() => onVerDetalle(activo)}
            aria-label={`Ver ${activo.nombre} en detalle`}
            className="block w-full overflow-hidden rounded-3xl bg-(--carta-elevado)"
          >
            {/* La `key` remonta la foto en cada cambio de plato, y con eso vuelve a correr su
                animación de entrada: el cambio se lee como un fundido, no como un salto. */}
            {urlImagen(activo.imagenUrl) ? (
              <img
                key={activo.id}
                src={urlImagen(activo.imagenUrl)!}
                alt={activo.nombre}
                className="animar-revelar aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center text-(--carta-suave)">
                <UtensilsCrossed className="h-14 w-14" strokeWidth={1} />
              </div>
            )}
          </button>

          <div key={`${activo.id}-ficha`} className="animar-revelar mt-6">
            <h3 className="text-2xl font-semibold tracking-tight">{activo.nombre}</h3>
            {activo.descripcion && (
              <p className="mt-3 leading-relaxed text-(--carta-suave)">{activo.descripcion}</p>
            )}
            <p className="mt-5 text-2xl font-semibold tabular-nums">
              {formatearPrecio(activo.precio)}
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
