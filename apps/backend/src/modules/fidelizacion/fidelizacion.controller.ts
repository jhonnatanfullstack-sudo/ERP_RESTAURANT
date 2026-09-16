import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getParam } from '../../utils/request-params';
import * as fidelizacionService from './fidelizacion.service';

export async function listarClientes(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await fidelizacionService.listarClientesConPuntos());
  } catch (error) {
    next(error);
  }
}

export async function listarMovimientosDeCliente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const clienteId = getParam(req, 'clienteId');
    const [saldo, movimientos] = await Promise.all([
      fidelizacionService.obtenerSaldo(clienteId),
      fidelizacionService.listarMovimientosCliente(clienteId),
    ]);
    sendSuccess(res, { saldo, movimientos });
  } catch (error) {
    next(error);
  }
}

export async function canjear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const movimiento = await fidelizacionService.canjearPuntos(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, movimiento, 'Puntos canjeados', 201);
  } catch (error) {
    next(error);
  }
}

export async function ajustar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const movimiento = await fidelizacionService.ajustarPuntos(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, movimiento, 'Ajuste registrado', 201);
  } catch (error) {
    next(error);
  }
}
