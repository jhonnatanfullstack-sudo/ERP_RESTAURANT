import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import * as categoriaService from './categoria.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await categoriaService.listarCategorias());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await categoriaService.obtenerCategoria(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categoria = await categoriaService.crearCategoria(req.body);
    sendSuccess(res, categoria, 'Categoría creada', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categoria = await categoriaService.actualizarCategoria(getIdParam(req), req.body);
    sendSuccess(res, categoria, 'Categoría actualizada');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await categoriaService.eliminarCategoria(getIdParam(req));
    sendSuccess(res, null, 'Categoría eliminada');
  } catch (error) {
    next(error);
  }
}
