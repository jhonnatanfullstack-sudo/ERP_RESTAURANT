import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getParam } from '../../utils/request-params';
import * as costeoService from './costeo.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await costeoService.listarCosteo());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await costeoService.obtenerCosteoDeProducto(getParam(req, 'productoId')));
  } catch (error) {
    next(error);
  }
}
