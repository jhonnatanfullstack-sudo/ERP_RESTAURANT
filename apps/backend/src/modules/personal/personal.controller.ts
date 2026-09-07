import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as personalService from './personal.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await personalService.listarPersonal());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await personalService.obtenerPersonal(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const personal = await personalService.crearPersonal(req.body);
    sendSuccess(res, personal, 'Personal creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const personal = await personalService.actualizarPersonal(getIdParam(req), req.body);
    sendSuccess(res, personal, 'Personal actualizado');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await personalService.eliminarPersonal(getIdParam(req));
    sendSuccess(res, null, 'Personal desactivado');
  } catch (error) {
    next(error);
  }
}
