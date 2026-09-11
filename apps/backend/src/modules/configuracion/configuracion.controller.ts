import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as configuracionService from './configuracion.service';

export async function obtener(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await configuracionService.obtenerConfiguracion());
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const configuracion = await configuracionService.actualizarConfiguracion(req.body);
    sendSuccess(res, configuracion, 'Configuración actualizada');
  } catch (error) {
    next(error);
  }
}
