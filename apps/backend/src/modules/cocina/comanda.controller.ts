import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as comandaService from './comanda.service';
import type { EstadoComanda } from './comanda.entity';

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const estado = req.query.estado as EstadoComanda | undefined;
    sendSuccess(res, await comandaService.listarComandas(estado));
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await comandaService.obtenerComanda(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comanda = await comandaService.crearComanda(req.body);
    sendSuccess(res, comanda, 'Comanda enviada a cocina', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizarEstado(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const comanda = await comandaService.actualizarEstadoComanda(getIdParam(req), req.body);
    sendSuccess(res, comanda, 'Comanda actualizada');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await comandaService.cancelarComanda(getIdParam(req));
    sendSuccess(res, null, 'Comanda cancelada');
  } catch (error) {
    next(error);
  }
}
