import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as existenciaService from './existencia.service';

export async function listarMovimientos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { almacenId, insumoId, productoId } = req.query as Record<string, string | undefined>;
    sendSuccess(
      res,
      await existenciaService.listarMovimientos({ almacenId, insumoId, productoId }),
    );
  } catch (error) {
    next(error);
  }
}

export async function listarStock(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await existenciaService.listarStockConsolidado());
  } catch (error) {
    next(error);
  }
}

export async function registrarMovimiento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const movimiento = await existenciaService.registrarMovimientoManual(
      req.usuarioAuth!.sub,
      req.body,
    );
    sendSuccess(res, movimiento, 'Movimiento registrado', 201);
  } catch (error) {
    next(error);
  }
}
