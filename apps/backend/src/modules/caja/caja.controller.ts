import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as cajaService from './caja.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await cajaService.listarCajas());
  } catch (error) {
    next(error);
  }
}

export async function obtenerActual(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await cajaService.obtenerCajaAbierta());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await cajaService.obtenerCaja(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function abrir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caja = await cajaService.abrirCaja(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, caja, 'Caja abierta', 201);
  } catch (error) {
    next(error);
  }
}

export async function cerrar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const caja = await cajaService.cerrarCaja(getIdParam(req), req.usuarioAuth!.sub, req.body);
    sendSuccess(res, caja, 'Caja cerrada');
  } catch (error) {
    next(error);
  }
}

export async function registrarMovimiento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const caja = await cajaService.registrarMovimiento(
      getIdParam(req),
      req.usuarioAuth!.sub,
      req.body,
    );
    sendSuccess(res, caja, 'Movimiento registrado', 201);
  } catch (error) {
    next(error);
  }
}
