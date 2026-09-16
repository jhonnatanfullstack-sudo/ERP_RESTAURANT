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

/** Una tesela grande ocupa cuatro celdas (2x2). Por debajo de esta cantidad de platos no
 * quedan normales suficientes para rellenar las celdas que deja libres a su costado, y la
 * categoría se ve con un boquete: una carta corta —o una categoría de una sola bebida— se
 * lee mejor con todas las teselas iguales que con una gigante y media fila vacía. */
const MINIMO_PARA_DESTACAR = 5;

function tamanoDe(indice: number, producto: Producto, total: number): TamanoTarjeta {
  if (total < MINIMO_PARA_DESTACAR) return 'normal';
  const conFoto = urlImagen(producto.imagenUrl) !== null;
  // Sin foto, una tesela grande queda casi vacía: se fuerza siempre a tamaño normal.
  return conFoto && indice % CADA_DESTACADO === 0 ? 'grande' : 'normal';
}

/** Columnas según cuántos platos hay que colocar. Con la grilla siempre a cuatro columnas,
 * una categoría de uno o tres platos dejaba el resto de la fila en blanco; recortando las
 * columnas, los mismos platos llenan la fila y se ven más grandes. Las clases se escriben
 * literales —no interpoladas— porque Tailwind solo genera las que encuentra en el código. */
const COLUMNAS_POR_CANTIDAD: Record<number, string> = {
  1: 'grid-cols-1 sm:grid-cols-2',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
};

const COLUMNAS_COMPLETAS = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';

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
  const columnas = COLUMNAS_POR_CANTIDAD[productos.length] ?? COLUMNAS_COMPLETAS;

  return (
    <div
      className={`grid grid-flow-row-dense gap-3 auto-rows-[150px] sm:gap-4 sm:auto-rows-[190px] lg:auto-rows-[210px] ${columnas}`}
    >
      {productos.map((producto, indice) => {
        const cantidad = items.find((item) => item.productoId === producto.id)?.cantidad ?? 0;
        return (
          <TarjetaPlatoBento
            key={producto.id}
            producto={producto}
            tamano={tamanoDe(indice, producto, productos.length)}
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
