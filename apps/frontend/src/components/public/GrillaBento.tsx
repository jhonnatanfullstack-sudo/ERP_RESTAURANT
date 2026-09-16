import { TarjetaPlatoBento, type TamanoTarjeta } from './TarjetaPlatoBento';
import { urlImagen } from '../../utils/formato';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

interface GrillaBentoProps {
  productos: Producto[];
  items: ItemBandeja[];
  permitirPedidos: boolean;
  onAgregar: (productoId: string) => void;
  onVerDetalle: (producto: Producto) => void;
}

/** Cada cuántos platos con foto el siguiente se destaca a doble tamaño. Es lo que le da a la
 * grilla el ritmo "bento" (ver skill de motion design): sin esto todas las fotos pesarían igual
 * y se leería como una hoja de cálculo con imágenes. */
const CADA_DESTACADO = 5;

function tamanoDe(indice: number, producto: Producto): TamanoTarjeta {
  const conFoto = urlImagen(producto.imagenUrl) !== null;
  // Sin foto, una tesela grande queda casi vacía: se fuerza siempre a tamaño normal.
  return conFoto && indice % CADA_DESTACADO === 0 ? 'grande' : 'normal';
}

/**
 * Grilla de tarjetas de tamaño mixto (grid-auto-flow: dense rellena los huecos que deja cada
 * tesela grande con las normales que siguen). Se reusa tanto en "Recomendados" como en cada
 * categoría de la carta, para que ambas secciones compartan el mismo lenguaje visual.
 */
export function GrillaBento({
  productos,
  items,
  permitirPedidos,
  onAgregar,
  onVerDetalle,
}: GrillaBentoProps) {
  return (
    <div className="grid grid-flow-row-dense grid-cols-2 gap-3 auto-rows-[150px] sm:grid-cols-3 sm:gap-4 sm:auto-rows-[190px] lg:grid-cols-4 lg:auto-rows-[210px]">
      {productos.map((producto, indice) => {
        const cantidad = items.find((item) => item.productoId === producto.id)?.cantidad ?? 0;
        return (
          <TarjetaPlatoBento
            key={producto.id}
            producto={producto}
            tamano={tamanoDe(indice, producto)}
            indice={indice}
            cantidad={cantidad}
            permitirPedidos={permitirPedidos}
            onAgregar={() => onAgregar(producto.id)}
            onVerDetalle={() => onVerDetalle(producto)}
          />
        );
      })}
    </div>
  );
}
