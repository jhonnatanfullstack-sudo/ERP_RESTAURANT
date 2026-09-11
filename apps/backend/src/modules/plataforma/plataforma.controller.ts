import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getParam } from '../../utils/request-params';
import * as plataformaService from './plataforma.service';

export async function panel(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await plataformaService.obtenerPanel());
  } catch (error) {
    next(error);
  }
}

export async function usoDiario(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await plataformaService.obtenerUsoDiario(getParam(req, 'empresaId')));
  } catch (error) {
    next(error);
  }
}

export async function accion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const resultado = await plataformaService.aplicarAccion(getParam(req, 'empresaId'), req.body);
    sendSuccess(res, resultado, 'Estado de la empresa actualizado');
  } catch (error) {
    next(error);
  }
}
