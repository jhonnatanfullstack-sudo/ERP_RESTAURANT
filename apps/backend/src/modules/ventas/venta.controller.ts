import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as ventaService from './venta.service';
import type { EstadoVenta } from './venta.entity';

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const estado = req.query.estado as EstadoVenta | undefined;
    sendSuccess(res, await ventaService.listarVentas(estado));
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await ventaService.obtenerVenta(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const venta = await ventaService.crearVenta(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, venta, 'Venta registrada', 201);
  } catch (error) {
    next(error);
  }
}

export async function anular(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ventaService.anularVenta(req.usuarioAuth!.sub, getIdParam(req));
    sendSuccess(res, null, 'Venta anulada');
  } catch (error) {
    next(error);
  }
}
