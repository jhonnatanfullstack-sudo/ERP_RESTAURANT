import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as almacenService from './almacen.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await almacenService.listarAlmacenes());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await almacenService.obtenerAlmacen(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const almacen = await almacenService.crearAlmacen(req.body);
    sendSuccess(res, almacen, 'Almacén creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const almacen = await almacenService.actualizarAlmacen(getIdParam(req), req.body);
    sendSuccess(res, almacen, 'Almacén actualizado');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await almacenService.eliminarAlmacen(getIdParam(req));
    sendSuccess(res, null, 'Almacén eliminado');
  } catch (error) {
    next(error);
  }
}
