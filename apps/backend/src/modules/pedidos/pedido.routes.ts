import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import {
  validateBody,
  validateIdParam,
  validateUuidParam,
} from '../../middlewares/validate.middleware';
import {
  actualizarDetalleSchema,
  actualizarPedidoSchema,
  agregarDetalleSchema,
  crearPedidoSchema,
} from './pedido.dto';
import * as pedidoController from './pedido.controller';

export const pedidoRouter = Router();

pedidoRouter.use(requireAuth);

pedidoRouter.get('/', requirePermission('pedidos.ver'), pedidoController.listar);
pedidoRouter.get(
  '/:id',
  requirePermission('pedidos.ver'),
  validateIdParam,
  pedidoController.obtener,
);
pedidoRouter.post(
  '/',
  requirePermission('pedidos.crear'),
  validateBody(crearPedidoSchema),
  pedidoController.crear,
);
pedidoRouter.put(
  '/:id',
  requirePermission('pedidos.editar'),
  validateIdParam,
  validateBody(actualizarPedidoSchema),
  pedidoController.actualizar,
);
pedidoRouter.delete(
  '/:id',
  requirePermission('pedidos.eliminar'),
  validateIdParam,
  pedidoController.eliminar,
);

pedidoRouter.post(
  '/:id/detalles',
  requirePermission('pedidos.editar'),
  validateIdParam,
  validateBody(agregarDetalleSchema),
  pedidoController.agregarDetalle,
);
pedidoRouter.put(
  '/:id/detalles/:detalleId',
  requirePermission('pedidos.editar'),
  validateIdParam,
  validateUuidParam('detalleId'),
  validateBody(actualizarDetalleSchema),
  pedidoController.actualizarDetalle,
);
pedidoRouter.delete(
  '/:id/detalles/:detalleId',
  requirePermission('pedidos.editar'),
  validateIdParam,
  validateUuidParam('detalleId'),
  pedidoController.eliminarDetalle,
);
