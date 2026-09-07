import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
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
