import { useMovimientoReducido } from '../../hooks/animacion';
import { urlImagen } from '../../utils/formato';
import type { Producto } from '../../types/api';

/** Con una sola foto no hay cinta que mover. */
const MINIMO_FOTOS = 2;
/** Fotos que debe tener cada mitad del bucle para cubrir una pantalla ancha sin huecos: con
 * un catálogo corto se repite el mismo plato varias veces, que es preferible a una tira a
 * medio llenar. */
const FOTOS_POR_MITAD = 10;
/** Segundos por foto: el ciclo se alarga con el catálogo para que la velocidad no cambie. */
const SEGUNDOS_POR_FOTO = 5;

interface TiraFotosProps {
  productos: Producto[];
  onVerDetalle: (producto: Producto) => void;
}

/**
 * Cinta de fotos que cruza el ancho completo de la pantalla, debajo del hero. Es la vitrina
 * de entrada: muestra la comida real antes de que el visitante decida bajar. Se duplica la
 * lista una vez para que el bucle no tenga corte visible (ver `.animar-tira` en index.css),
 * y la copia queda oculta a lectores de pantalla para no leer el catálogo dos veces.
 * Se pausa al pasar el mouse y cada foto abre la ficha de ese plato.
 */
export function TiraFotos({ productos, onVerDetalle }: TiraFotosProps) {
  const movimientoReducido = useMovimientoReducido();

  const conFoto = productos.filter((producto) => urlImagen(producto.imagenUrl) !== null);
  if (conFoto.length < MINIMO_FOTOS) return null;

  // Una mitad del bucle: el catálogo repetido hasta llenar la pantalla. Las dos mitades son
  // idénticas, que es lo que hace que el -50% de la animación cierre el ciclo sin salto.
  const repeticiones = Math.max(1, Math.ceil(FOTOS_POR_MITAD / conFoto.length));
  const mitad = Array.from({ length: repeticiones }, () => conFoto).flat();
  const duracion = `${mitad.length * SEGUNDOS_POR_FOTO}s`;

  return (
    <div className="overflow-hidden border-y border-(--carta-borde) bg-(--carta-superficie) py-4">
      <div
        className={movimientoReducido ? 'flex gap-4' : 'animar-tira flex w-max gap-4'}
        style={{ '--duracion-tira': duracion } as React.CSSProperties}
      >
        {[0, 1].map((copia) =>
          mitad.map((producto, indice) => (
            <button
              key={`${copia}-${indice}-${producto.id}`}
              type="button"
              // La segunda copia solo existe para cerrar el bucle: no debe navegarse ni leerse.
              aria-hidden={copia === 1}
              tabIndex={copia === 1 ? -1 : undefined}
              onClick={() => onVerDetalle(producto)}
              aria-label={`Ver ${producto.nombre} en detalle`}
              className="group relative h-28 w-40 shrink-0 overflow-hidden rounded-xl sm:h-36 sm:w-52"
            >
              <img
                src={urlImagen(producto.imagenUrl)!}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-3 pt-8 pb-2 text-left text-xs font-semibold text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                {producto.nombre}
              </span>
            </button>
          )),
        )}
      </div>
    </div>
  );
}
