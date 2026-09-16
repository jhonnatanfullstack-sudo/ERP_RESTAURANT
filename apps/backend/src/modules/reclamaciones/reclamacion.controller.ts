import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as reclamacionService from './reclamacion.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await reclamacionService.listarReclamaciones());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await reclamacionService.obtenerReclamacion(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function responder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const reclamacion = await reclamacionService.responderReclamacion(
      getIdParam(req),
      req.usuarioAuth!.sub,
      req.body,
    );
    sendSuccess(res, reclamacion, 'Respuesta registrada');
  } catch (error) {
    next(error);
  }
}
