import { SeccionRevelada } from './SeccionRevelada';
import { GrillaBento } from './GrillaBento';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

export interface GrupoCategoria {
  categoria: { id: string; nombre: string };
  productos: Producto[];
}

interface SeccionCategoriaBentoProps {
  grupo: GrupoCategoria;
  /** Posición entre las categorías visibles: alimenta el número "01, 02…" del encabezado. */
  indice: number;
  items: ItemBandeja[];
  permitirPedidos: boolean;
  onAgregar: (productoId: string) => void;
  onVerDetalle: (producto: Producto) => void;
  /** Registra el nodo de la sección para el scrollspy de la barra superior. */
  registrarSeccion: (id: string) => (elemento: HTMLElement | null) => void;
}

/**
 * Una categoría de la carta: el encabezado "de capítulo" (número grande + nombre) seguido de su
 * grilla bento. Cada categoría es su propia sección para que el scrollspy y el salto directo
 * desde la barra de búsqueda sigan funcionando igual que antes.
 */
export function SeccionCategoriaBento({
  grupo,
  indice,
  items,
  permitirPedidos,
  onAgregar,
  onVerDetalle,
  registrarSeccion,
}: SeccionCategoriaBentoProps) {
  return (
    <section
      ref={registrarSeccion(grupo.categoria.id)}
      data-categoria-id={grupo.categoria.id}
      className="scroll-mt-40"
    >
      <SeccionRevelada className="flex items-baseline gap-4 border-b border-(--carta-borde) pb-4">
        <span
          aria-hidden="true"
          className="text-4xl font-bold text-(--carta-borde) tabular-nums sm:text-5xl"
        >
          {String(indice + 1).padStart(2, '0')}
        </span>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {grupo.categoria.nombre}
        </h2>
      </SeccionRevelada>

      <div className="mt-6">
        <GrillaBento
          productos={grupo.productos}
          items={items}
          permitirPedidos={permitirPedidos}
          onAgregar={onAgregar}
          onVerDetalle={onVerDetalle}
        />
      </div>
    </section>
  );
}
