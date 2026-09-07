import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as usuarioService from './usuario.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await usuarioService.listarUsuarios());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await usuarioService.obtenerUsuario(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const usuario = await usuarioService.crearUsuario(req.body);
    sendSuccess(res, usuario, 'Usuario creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const usuario = await usuarioService.actualizarUsuario(getIdParam(req), req.body);
    sendSuccess(res, usuario, 'Usuario actualizado');
  } catch (error) {
    next(error);
  }
}
