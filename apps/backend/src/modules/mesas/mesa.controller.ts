import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as mesaService from './mesa.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await mesaService.listarMesas());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await mesaService.obtenerMesa(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const mesa = await mesaService.crearMesa(req.body);
    sendSuccess(res, mesa, 'Mesa creada', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const mesa = await mesaService.actualizarMesa(getIdParam(req), req.body);
    sendSuccess(res, mesa, 'Mesa actualizada');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await mesaService.eliminarMesa(getIdParam(req));
    sendSuccess(res, null, 'Mesa eliminada');
  } catch (error) {
    next(error);
  }
}
