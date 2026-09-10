import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as compraService from './compra.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await compraService.listarCompras());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await compraService.obtenerCompra(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const compra = await compraService.crearCompra(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, compra, 'Compra registrada', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const compra = await compraService.actualizarCompra(
      getIdParam(req),
      req.usuarioAuth!.sub,
      req.body,
    );
    sendSuccess(res, compra, 'Compra actualizada');
  } catch (error) {
    next(error);
  }
}

export async function anular(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const compra = await compraService.anularCompra(getIdParam(req), req.usuarioAuth!.sub);
    sendSuccess(res, compra, 'Compra anulada');
  } catch (error) {
    next(error);
  }
}
