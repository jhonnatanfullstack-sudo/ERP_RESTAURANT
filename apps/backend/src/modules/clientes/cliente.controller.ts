import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import { HttpError } from '../../utils/http-error';
import { consultarDocumento } from '../catalogos/consulta-documento.service';
import * as clienteService from './cliente.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await clienteService.listarClientes());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await clienteService.obtenerCliente(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cliente = await clienteService.crearCliente(req.body);
    sendSuccess(res, cliente, 'Cliente creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cliente = await clienteService.actualizarCliente(getIdParam(req), req.body);
    sendSuccess(res, cliente, 'Cliente actualizado');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await clienteService.eliminarCliente(getIdParam(req));
    sendSuccess(res, null, 'Cliente desactivado');
  } catch (error) {
    next(error);
  }
}

export async function consultarDocumentoExterno(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { tipo, numero } = req.query;
    if ((tipo !== 'dni' && tipo !== 'ruc') || typeof numero !== 'string' || numero.length === 0) {
      throw new HttpError(400, 'Parámetros inválidos', [
        'tipo debe ser dni|ruc, numero es requerido',
      ]);
    }
    const datos = await consultarDocumento(tipo, numero);
    sendSuccess(res, datos);
  } catch (error) {
    next(error);
  }
}
