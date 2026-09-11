import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as talonarioService from './talonario.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await talonarioService.listarTalonarios());
  } catch (error) {
    next(error);
  }
}

/**
 * Talonarios que puede usar quien está autenticado, para el selector de Ventas. No exige
 * `talonarios.ver` (ver `talonario.routes.ts`): un cajero emite comprobantes sin tener por qué
 * administrar los talonarios de los demás.
 */
export async function listarMios(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tipoComprobanteId =
      typeof req.query.tipoComprobanteId === 'string' ? req.query.tipoComprobanteId : undefined;
    sendSuccess(
      res,
      await talonarioService.listarTalonariosDeUsuario(req.usuarioAuth!.sub, tipoComprobanteId),
    );
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await talonarioService.obtenerTalonarioVista(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const talonario = await talonarioService.crearTalonario(req.body);
    sendSuccess(res, talonario, 'Talonario creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const talonario = await talonarioService.actualizarTalonario(getIdParam(req), req.body);
    sendSuccess(res, talonario, 'Talonario actualizado');
  } catch (error) {
    next(error);
  }
}

export async function asignarUsuarios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const talonario = await talonarioService.asignarUsuarios(getIdParam(req), req.body);
    sendSuccess(res, talonario, 'Usuarios asignados');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await talonarioService.eliminarTalonario(getIdParam(req));
    sendSuccess(res, null, 'Talonario eliminado');
  } catch (error) {
    next(error);
  }
}
