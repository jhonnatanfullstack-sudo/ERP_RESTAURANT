import { ProductoCarta } from './ProductoCarta';
import { PlatoFila } from './PlatoFila';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

/** Hasta esta cantidad, la categoría se presenta en filas grandes; a partir de aquí, en
 * grilla. Con uno o dos platos una grilla de tres columnas deja huecos y la página se ve
 * incompleta, que es el problema que esto resuelve. */
const MAXIMO_EN_FILAS = 2;

interface SeccionCategoriaCartaProps {
  categoria: { id: string; nombre: string };
  productos: Producto[];
  items: ItemBandeja[];
  onAgregar: (productoId: string) => void;
  onQuitarUna: (productoId: string, cantidadActual: number) => void;
  onVerDetalle: (producto: Producto) => void;
  /** Posición de la categoría en la página: alterna el lado de la foto entre una sección y
   * la siguiente, para que dos filas seguidas no se lean como la misma plantilla repetida. */
  desfase: number;
  /** `true` una vez que la sección entró en el viewport al menos una vez (scrollspy de
   * `Carta.tsx`), lo que dispara su entrada animada. */
  revelada: boolean;
  /** Registra el nodo de la sección para el scrollspy: resaltar la categoría activa en la
   * barra de arriba y poder saltar aquí con `scrollIntoView`. */
  registrarSeccion: (elemento: HTMLElement | null) => void;
}

/**
 * Un bloque "categoría + sus platos". El layout se adapta a cuántos platos hay: pocos van en
 * filas grandes alternadas y muchos en grilla. Todas las categorías quedan siempre visibles
 * y la barra pegajosa salta entre ellas, que es como se navega un menú digital.
 */
export function SeccionCategoriaCarta({
  categoria,
  productos,
  items,
  onAgregar,
  onQuitarUna,
  onVerDetalle,
  desfase,
  revelada,
  registrarSeccion,
}: SeccionCategoriaCartaProps) {
  const enFilas = productos.length <= MAXIMO_EN_FILAS;

  const cantidadDe = (producto: Producto) =>
    items.find((item) => item.productoId === producto.id)?.cantidad ?? 0;

  return (
    <section ref={registrarSeccion} data-categoria-id={categoria.id} className="scroll-mt-40">
      <div
        className={`transition-all duration-700 ${
          revelada ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div className="flex items-baseline gap-4">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{categoria.nombre}</h2>
          <span className="text-sm text-(--carta-suave) tabular-nums">{productos.length}</span>
        </div>
        <div className="mt-4 h-px bg-(--carta-borde)">
          {revelada && <div className="animar-linea h-px w-24 bg-(--carta-acento)" />}
        </div>
      </div>

      {enFilas ? (
        <div className="mt-8 flex flex-col gap-6">
          {productos.map((producto, indice) => (
            <PlatoFila
              key={producto.id}
              producto={producto}
              cantidadEnBandeja={cantidadDe(producto)}
              onAgregar={() => onAgregar(producto.id)}
              onQuitarUna={() => onQuitarUna(producto.id, cantidadDe(producto) || 1)}
              onVerDetalle={() => onVerDetalle(producto)}
              invertida={(indice + desfase) % 2 === 1}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {productos.map((producto, indice) => (
            <ProductoCarta
              key={producto.id}
              producto={producto}
              cantidadEnBandeja={cantidadDe(producto)}
              onAgregar={() => onAgregar(producto.id)}
              onQuitarUna={() => onQuitarUna(producto.id, cantidadDe(producto) || 1)}
              onVerDetalle={() => onVerDetalle(producto)}
              retraso={Math.min(indice, 6) * 60}
            />
          ))}
        </div>
      )}
    </section>
  );
}
