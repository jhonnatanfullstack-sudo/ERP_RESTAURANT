import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as guiaRemisionService from './guia-remision.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await guiaRemisionService.listarGuiasRemision());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await guiaRemisionService.obtenerGuiaRemision(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guia = await guiaRemisionService.crearGuiaRemision(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, guia, 'Guía de remisión registrada', 201);
  } catch (error) {
    next(error);
  }
}

export async function emitir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guia = await guiaRemisionService.emitirGuiaRemision(getIdParam(req));
    sendSuccess(res, guia, 'Guía de remisión emitida');
  } catch (error) {
    next(error);
  }
}

export async function reintentar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guia = await guiaRemisionService.reintentarEnvioGuia(getIdParam(req));
    sendSuccess(res, guia, 'Guía de remisión reenviada');
  } catch (error) {
    next(error);
  }
}
