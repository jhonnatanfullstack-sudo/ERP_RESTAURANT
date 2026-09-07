import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as rolService from './rol.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await rolService.listarRoles());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await rolService.obtenerRol(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rol = await rolService.crearRol(req.body);
    sendSuccess(res, rol, 'Rol creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rol = await rolService.actualizarRol(getIdParam(req), req.body);
    sendSuccess(res, rol, 'Rol actualizado');
  } catch (error) {
    next(error);
  }
}

export async function asignarPermisos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rol = await rolService.asignarPermisos(getIdParam(req), req.body);
    sendSuccess(res, rol, 'Permisos actualizados');
  } catch (error) {
    next(error);
  }
}
