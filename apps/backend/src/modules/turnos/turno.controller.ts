import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as turnoService from './turno.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await turnoService.listarTurnos());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await turnoService.obtenerTurno(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function obtenerMiTurno(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await turnoService.obtenerTurnoAbiertoDeUsuario(req.usuarioAuth!.sub));
  } catch (error) {
    next(error);
  }
}

export async function abrir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const turno = await turnoService.abrirTurno(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, turno, 'Turno iniciado', 201);
  } catch (error) {
    next(error);
  }
}

export async function cerrar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const turno = await turnoService.cerrarTurno(getIdParam(req), req.usuarioAuth!.sub, req.body);
    sendSuccess(res, turno, 'Turno cerrado');
  } catch (error) {
    next(error);
  }
}
