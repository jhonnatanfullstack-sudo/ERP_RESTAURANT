import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as insumoService from './insumo.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await insumoService.listarInsumos());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await insumoService.obtenerInsumo(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const insumo = await insumoService.crearInsumo(req.body);
    sendSuccess(res, insumo, 'Insumo creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const insumo = await insumoService.actualizarInsumo(getIdParam(req), req.body);
    sendSuccess(res, insumo, 'Insumo actualizado');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await insumoService.desactivarInsumo(getIdParam(req));
    sendSuccess(res, null, 'Insumo desactivado');
  } catch (error) {
    next(error);
  }
}
