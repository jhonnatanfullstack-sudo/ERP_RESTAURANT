import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as notificacionService from './notificacion.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await notificacionService.listarNotificaciones());
  } catch (error) {
    next(error);
  }
}

export async function contarNoLeidas(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, { noLeidas: await notificacionService.contarNoLeidas() });
  } catch (error) {
    next(error);
  }
}

export async function marcarLeida(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await notificacionService.marcarLeida(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function marcarTodasLeidas(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await notificacionService.marcarTodasLeidas();
    sendSuccess(res, null, 'Notificaciones marcadas como leídas');
  } catch (error) {
    next(error);
  }
}
