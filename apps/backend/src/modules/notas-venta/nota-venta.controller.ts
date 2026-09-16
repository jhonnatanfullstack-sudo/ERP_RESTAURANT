import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam, getParam } from '../../utils/request-params';
import * as notaVentaService from './nota-venta.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await notaVentaService.listarNotasVenta());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await notaVentaService.obtenerNotaVenta(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function listarDeVenta(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await notaVentaService.listarNotasDeVenta(getParam(req, 'ventaId')));
  } catch (error) {
    next(error);
  }
}

export async function crearCredito(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const nota = await notaVentaService.crearNotaCredito(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, nota, 'Nota de crédito registrada', 201);
  } catch (error) {
    next(error);
  }
}

export async function crearDebito(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const nota = await notaVentaService.crearNotaDebito(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, nota, 'Nota de débito registrada', 201);
  } catch (error) {
    next(error);
  }
}

export async function emitir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await notaVentaService.emitirNotaVenta(getIdParam(req)), 'Nota enviada');
  } catch (error) {
    next(error);
  }
}

export async function reintentar(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await notaVentaService.reintentarEnvioNota(getIdParam(req)), 'Reintento enviado');
  } catch (error) {
    next(error);
  }
}
