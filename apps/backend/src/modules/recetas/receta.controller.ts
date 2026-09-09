import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getParam } from '../../utils/request-params';
import * as recetaService from './receta.service';

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await recetaService.obtenerRecetaDeProducto(getParam(req, 'productoId')));
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
    sendSuccess(res, receta, 'Receta actualizada');
  } catch (error) {
    next(error);
  }
}
