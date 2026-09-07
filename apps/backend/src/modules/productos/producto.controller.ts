import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam } from '../../utils/request-params';
import { HttpError } from '../../utils/http-error';
import * as productoService from './producto.service';

export async function listar(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await productoService.listarProductos());
  } catch (error) {
    next(error);
  }
}

export async function listarPublico(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await productoService.listarProductosPublico());
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await productoService.obtenerProducto(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const producto = await productoService.crearProducto(req.body);
    sendSuccess(res, producto, 'Producto creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const producto = await productoService.actualizarProducto(getIdParam(req), req.body);
    sendSuccess(res, producto, 'Producto actualizado');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await productoService.eliminarProducto(getIdParam(req));
    sendSuccess(res, null, 'Producto eliminado');
  } catch (error) {
    next(error);
  }
}

export async function subirImagen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw new HttpError(400, 'Debe adjuntar una imagen', ['imagen es requerida']);
    }
    const producto = await productoService.actualizarImagenProducto(getIdParam(req), req.file);
    sendSuccess(res, producto, 'Imagen actualizada');
  } catch (error) {
    next(error);
  }
}
