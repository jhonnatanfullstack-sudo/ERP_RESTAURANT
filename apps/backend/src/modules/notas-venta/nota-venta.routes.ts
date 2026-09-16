import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import {
  validateBody,
  validateIdParam,
  validateUuidParam,
} from '../../middlewares/validate.middleware';
import { crearNotaCreditoSchema, crearNotaDebitoSchema } from './nota-venta.dto';
import * as notaVentaController from './nota-venta.controller';

export const notaVentaRouter = Router();

notaVentaRouter.use(requireAuth);

notaVentaRouter.get('/', requirePermission('notas_venta.ver'), notaVentaController.listar);
notaVentaRouter.get(
  '/de-venta/:ventaId',
  requirePermission('notas_venta.ver'),
  validateUuidParam('ventaId'),
  notaVentaController.listarDeVenta,
);
notaVentaRouter.get(
  '/:id',
  requirePermission('notas_venta.ver'),
  validateIdParam,
  notaVentaController.obtener,
);

notaVentaRouter.post(
  '/credito',
  requirePermission('notas_venta.crear'),
  validateBody(crearNotaCreditoSchema),
  notaVentaController.crearCredito,
);
notaVentaRouter.post(
  '/debito',
  requirePermission('notas_venta.crear'),
  validateBody(crearNotaDebitoSchema),
  notaVentaController.crearDebito,
);

notaVentaRouter.post(
  '/:id/emitir',
  requirePermission('notas_venta.emitir'),
  validateIdParam,
  notaVentaController.emitir,
);
notaVentaRouter.post(
  '/:id/reintentar',
  requirePermission('notas_venta.emitir'),
  validateIdParam,
  notaVentaController.reintentar,
);
