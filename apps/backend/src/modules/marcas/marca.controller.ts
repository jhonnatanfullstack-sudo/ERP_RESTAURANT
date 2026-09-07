import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as marcaService from './marca.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await marcaService.listarMarcas());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await marcaService.obtenerMarca(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const marca = await marcaService.crearMarca(req.body);
    sendSuccess(res, marca, 'Marca creada', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const marca = await marcaService.actualizarMarca(getIdParam(req), req.body);
    sendSuccess(res, marca, 'Marca actualizada');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await marcaService.eliminarMarca(getIdParam(req));
    sendSuccess(res, null, 'Marca eliminada');
  } catch (error) {
    next(error);
  }
}
