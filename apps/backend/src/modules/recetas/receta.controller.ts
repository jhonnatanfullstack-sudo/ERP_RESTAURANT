import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getParam } from '../../utils/request-params';
import { obtenerUltimosCostosInsumos } from '../inventario/existencia.service';
import * as recetaService from './receta.service';

/** Enlaza el último costo de compra conocido de cada insumo a su línea — aquí, no en
 * `receta.service.ts`, porque `existencia.service.ts` ya importa `receta.service.ts` (para
 * descontar stock según receta); importar en el sentido contrario crearía un ciclo entre
 * ambos módulos. El controller sí puede depender de los dos sin problema. */
async function conCosto(lineas: Awaited<ReturnType<typeof recetaService.obtenerRecetaDeProducto>>) {
  const costos = await obtenerUltimosCostosInsumos();
  return lineas.map((linea) => ({
    ...linea,
    insumo: { ...linea.insumo, ultimoCosto: costos.get(linea.insumo.id) ?? null },
  }));
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const receta = await recetaService.obtenerRecetaDeProducto(getParam(req, 'productoId'));
    sendSuccess(res, await conCosto(receta));
  } catch (error) {
    next(error);
  }
}

export async function reemplazar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const receta = await recetaService.reemplazarReceta(
      getParam(req, 'productoId'),
      req.body.lineas,
    );
    sendSuccess(res, await conCosto(receta), 'Receta actualizada');
  } catch (error) {
    next(error);
  }
}
