import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as permisoService from './permiso.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await permisoService.listarPermisos());
  } catch (error) {
    next(error);
  }
}
