import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import * as catalogosService from './catalogos.service';

export async function tiposDocumentoIdentidad(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await catalogosService.listarTiposDocumentoIdentidad());
  } catch (error) {
    next(error);
  }
}

export async function tiposComprobante(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await catalogosService.listarTiposComprobante());
  } catch (error) {
    next(error);
  }
}

export async function unidadesMedida(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await catalogosService.listarUnidadesMedida());
  } catch (error) {
    next(error);
  }
}

export async function tiposAfectacionIgv(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await catalogosService.listarTiposAfectacionIgv());
  } catch (error) {
    next(error);
  }
}

export async function tiposOperacion(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await catalogosService.listarTiposOperacion());
  } catch (error) {
    next(error);
  }
}

export async function mediosPago(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await catalogosService.listarMediosPago());
  } catch (error) {
    next(error);
  }
}

export async function bancos(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await catalogosService.listarBancos());
  } catch (error) {
    next(error);
  }
}
