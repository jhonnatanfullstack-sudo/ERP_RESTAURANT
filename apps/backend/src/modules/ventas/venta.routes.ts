import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { crearVentaSchema } from './venta.dto';
import * as ventaController from './venta.controller';

export const ventaRouter = Router();

ventaRouter.use(requireAuth);

ventaRouter.get('/', requirePermission('ventas.ver'), ventaController.listar);
ventaRouter.get('/:id', requirePermission('ventas.ver'), validateIdParam, ventaController.obtener);
ventaRouter.post(
  '/',
  requirePermission('ventas.crear'),
  validateBody(crearVentaSchema),
  ventaController.crear,
);
ventaRouter.delete(
  '/:id',
  requirePermission('ventas.anular'),
  validateIdParam,
  ventaController.anular,
);
