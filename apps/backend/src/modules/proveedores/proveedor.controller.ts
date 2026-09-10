import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import { HttpError } from '../../utils/http-error';
import { consultarDocumento } from '../catalogos/consulta-documento.service';
import * as proveedorService from './proveedor.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await proveedorService.listarProveedores());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await proveedorService.obtenerProveedor(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const proveedor = await proveedorService.crearProveedor(req.body);
    sendSuccess(res, proveedor, 'Proveedor creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const proveedor = await proveedorService.actualizarProveedor(getIdParam(req), req.body);
    sendSuccess(res, proveedor, 'Proveedor actualizado');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await proveedorService.desactivarProveedor(getIdParam(req));
    sendSuccess(res, null, 'Proveedor desactivado');
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
        'tipo debe ser "dni" o "ruc", numero es requerido',
      ]);
    }
    const datos = await consultarDocumento(tipo, numero);
    sendSuccess(res, datos);
  } catch (error) {
    next(error);
  }
}
