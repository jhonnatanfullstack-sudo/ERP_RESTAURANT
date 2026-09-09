import { HttpError } from '../../utils/http-error';
import { insumoRepository } from '../insumos/insumo.repository';
import { productoRepository } from '../productos/producto.repository';
import { TipoProducto } from '../productos/producto.entity';
import { recetaInsumoRepository } from './receta.repository';
import type { LineaRecetaDto } from './receta.dto';
import type { RecetaInsumo } from './receta-insumo.entity';

export async function obtenerRecetaDeProducto(productoId: string): Promise<RecetaInsumo[]> {
  return recetaInsumoRepository.find({
    where: { producto: { id: productoId } },
    relations: { insumo: { unidadMedida: true } },
    order: { insumo: { nombre: 'ASC' } },
  });
}

/**
 * Reemplaza por completo la receta de un producto (borra las líneas anteriores e inserta las
 * nuevas) — más simple que hacer un diff línea por línea, y una receta rara vez cambia con
 * frecuencia suficiente para que el costo de reescribirla entera importe.
 */
export async function reemplazarReceta(
  productoId: string,
  lineas: LineaRecetaDto[],
): Promise<RecetaInsumo[]> {
  const producto = await productoRepository.findOneBy({ id: productoId });
  if (!producto) {
    throw new HttpError(400, 'El producto indicado no existe', ['productoId inválido']);
  }
  if (producto.tipo !== TipoProducto.SERVICIO) {
    throw new HttpError(400, 'Solo un producto tipo "servicio" puede tener receta');
  }

  const idsInsumos = [...new Set(lineas.map((l) => l.insumoId))];
  if (idsInsumos.length !== lineas.length) {
    throw new HttpError(400, 'La receta no puede repetir el mismo insumo en dos líneas');
  }

  // `insumoRepository.findBy([])` con un arreglo vacío de condiciones no filtra nada — devuelve
  // todos los insumos, no ninguno — así que hay que cortar antes de consultar cuando la receta
  // se está vaciando (0 líneas), o `insumos.length !== idsInsumos.length` dispararía un falso
  // "no existen" al comparar "todos los insumos" contra "0 ids".
  const insumoPorId = new Map(
    idsInsumos.length > 0
      ? (await insumoRepository.findBy(idsInsumos.map((id) => ({ id })))).map((i) => [i.id, i])
      : [],
  );
  if (insumoPorId.size !== idsInsumos.length) {
    throw new HttpError(400, 'Uno o más insumos indicados no existen', [
      'lineas[].insumoId inválido',
    ]);
  }

  await recetaInsumoRepository.delete({ producto: { id: productoId } });

  const nuevas = lineas.map((linea) =>
    recetaInsumoRepository.create({
      producto,
      insumo: insumoPorId.get(linea.insumoId),
      cantidad: linea.cantidad,
    }),
  );
  await recetaInsumoRepository.save(nuevas);

  return obtenerRecetaDeProducto(productoId);
}
