import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as salonService from './salon.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await salonService.listarSalones());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await salonService.obtenerSalon(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const salon = await salonService.crearSalon(req.body);
    sendSuccess(res, salon, 'Salón creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const salon = await salonService.actualizarSalon(getIdParam(req), req.body);
    sendSuccess(res, salon, 'Salón actualizado');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await salonService.eliminarSalon(getIdParam(req));
    sendSuccess(res, null, 'Salón eliminado');
  } catch (error) {
    next(error);
  }
}
