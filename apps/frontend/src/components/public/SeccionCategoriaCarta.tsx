import { UtensilsCrossed } from 'lucide-react';
import { ProductoCarta } from './ProductoCarta';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

interface SeccionCategoriaCartaProps {
  categoria: { id: string; nombre: string };
  productos: Producto[];
  items: ItemBandeja[];
  onAgregar: (productoId: string) => void;
  onQuitarUna: (productoId: string, cantidadActual: number) => void;
  /** `true` una vez que la sección entró en el viewport al menos una vez (scrollspy de
   * `Carta.tsx`) — controla la entrada animada del encabezado. */
  revelada: boolean;
  /** Registra el nodo de la sección para el scrollspy: resaltar la categoría activa en la
   * barra de arriba y poder saltar aquí con `scrollIntoView`. */
  registrarSeccion: (elemento: HTMLElement | null) => void;
}

/**
 * Un bloque "categoría + su grilla de platillos" dentro de la carta agrupada. Antes la
 * carta tenía una sola grilla filtrada por categoría (ocultaba las demás); ahora todas las
 * categorías están siempre visibles como secciones, y la barra de categorías salta entre
 * ellas — más parecido a cómo se navega un menú digital de restaurante (Uber Eats, Rappi).
 */
export function SeccionCategoriaCarta({
  categoria,
  productos,
  items,
  onAgregar,
  onQuitarUna,
  revelada,
  registrarSeccion,
}: SeccionCategoriaCartaProps) {
  return (
    <section ref={registrarSeccion} data-categoria-id={categoria.id} className="scroll-mt-[170px]">
      <div
        className={`mb-5 flex items-center gap-2 transition-all duration-700 ${
          revelada ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
          <UtensilsCrossed className="h-4 w-4" strokeWidth={2} />
        </span>
        <h2 className="text-xl font-bold text-zinc-900">{categoria.nombre}</h2>
        <span className="text-sm text-zinc-400">({productos.length})</span>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {productos.map((producto, indice) => {
          const enBandeja = items.find((item) => item.productoId === producto.id);
          return (
            <ProductoCarta
              key={producto.id}
              producto={producto}
              cantidadEnBandeja={enBandeja?.cantidad ?? 0}
              onAgregar={() => onAgregar(producto.id)}
              onQuitarUna={() => onQuitarUna(producto.id, enBandeja?.cantidad ?? 1)}
              retraso={Math.min(indice, 8) * 45}
            />
          );
        })}
      </div>
    </section>
  );
}
