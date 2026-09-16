import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import { HttpError } from '../../utils/http-error';
import { vistaPreviaRepartoSchema } from './reparto-propina.dto';
import * as repartoPropinaService from './reparto-propina.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await repartoPropinaService.listarRepartos());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await repartoPropinaService.obtenerReparto(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function vistaPrevia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validacion = vistaPreviaRepartoSchema.safeParse(req.query);
    if (!validacion.success) {
      throw new HttpError(
        400,
        'Parámetros inválidos',
        validacion.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    sendSuccess(res, await repartoPropinaService.vistaPreviaReparto(validacion.data));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reparto = await repartoPropinaService.crearReparto(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, reparto, 'Reparto de propinas registrado', 201);
  } catch (error) {
    next(error);
  }
}
