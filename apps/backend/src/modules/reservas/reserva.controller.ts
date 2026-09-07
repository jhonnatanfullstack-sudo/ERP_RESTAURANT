import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as reservaService from './reserva.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await reservaService.listarReservas());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await reservaService.obtenerReserva(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reserva = await reservaService.crearReserva(req.body);
    sendSuccess(res, reserva, 'Reserva creada', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reserva = await reservaService.actualizarReserva(getIdParam(req), req.body);
    sendSuccess(res, reserva, 'Reserva actualizada');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await reservaService.cancelarReserva(getIdParam(req));
    sendSuccess(res, null, 'Reserva cancelada');
  } catch (error) {
    next(error);
  }
}
