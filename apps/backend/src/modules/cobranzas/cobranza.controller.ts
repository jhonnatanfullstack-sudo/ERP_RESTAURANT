import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as cobranzaService from './cobranza.service';

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const soloPendientes = req.query.pendientes === 'true';
    sendSuccess(res, await cobranzaService.listarCuentasPorCobrar(soloPendientes));
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await cobranzaService.obtenerCobranza(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function registrarPago(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cobranza = await cobranzaService.registrarPago(
      getIdParam(req),
      req.usuarioAuth!.sub,
      req.body,
    );
    sendSuccess(res, cobranza, 'Pago registrado', 201);
  } catch (error) {
    next(error);
  }
}

export async function anularPago(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cobranza = await cobranzaService.anularPago(getIdParam(req), req.body);
    sendSuccess(res, cobranza, 'Pago anulado');
  } catch (error) {
    next(error);
  }
}
