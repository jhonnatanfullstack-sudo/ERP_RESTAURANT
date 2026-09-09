import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as empresaService from './empresa.service';
import { empresaPublica } from './empresa.mapper';

export async function obtenerPublica(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const empresa = await empresaService.obtenerEmpresaPublica();
    sendSuccess(res, empresa ? empresaPublica(empresa) : null);
  } catch (error) {
    next(error);
  }
}

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const empresas = await empresaService.listarEmpresas();
    sendSuccess(res, empresas);
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const empresa = await empresaService.obtenerEmpresa(getIdParam(req));
    sendSuccess(res, empresa);
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const empresa = await empresaService.crearEmpresa(req.body);
    sendSuccess(res, empresa, 'Empresa creada', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const empresa = await empresaService.actualizarEmpresa(getIdParam(req), req.body);
    sendSuccess(res, empresa, 'Empresa actualizada');
  } catch (error) {
    next(error);
  }
}
