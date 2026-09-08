import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam, getParam } from '../../utils/request-params';
import * as pedidoService from './pedido.service';
import type { EstadoPedido } from './pedido.entity';

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const estado = req.query.estado as EstadoPedido | undefined;
    sendSuccess(res, await pedidoService.listarPedidos(estado));
  } catch (error) {
    next(error);
  }
}

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await pedidoService.obtenerPedido(getIdParam(req)));
  } catch (error) {
    next(error);
  }
}

export async function crear(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pedido = await pedidoService.crearPedido(req.body);
    sendSuccess(res, pedido, 'Pedido creado', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pedido = await pedidoService.actualizarPedido(getIdParam(req), req.body);
    sendSuccess(res, pedido, 'Pedido actualizado');
  } catch (error) {
    next(error);
  }
}

export async function eliminar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await pedidoService.cancelarPedido(getIdParam(req));
    sendSuccess(res, null, 'Pedido cancelado');
  } catch (error) {
    next(error);
  }
}

export async function agregarDetalle(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const detalle = await pedidoService.agregarDetalle(getIdParam(req), req.body);
    sendSuccess(res, detalle, 'Producto agregado al pedido', 201);
  } catch (error) {
    next(error);
  }
}

export async function actualizarDetalle(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const detalle = await pedidoService.actualizarDetalle(
      getIdParam(req),
      getParam(req, 'detalleId'),
      req.body,
    );
    sendSuccess(res, detalle, 'Producto del pedido actualizado');
  } catch (error) {
    next(error);
  }
}

export async function eliminarDetalle(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await pedidoService.eliminarDetalle(getIdParam(req), getParam(req, 'detalleId'));
    sendSuccess(res, null, 'Producto quitado del pedido');
  } catch (error) {
    next(error);
  }
}
