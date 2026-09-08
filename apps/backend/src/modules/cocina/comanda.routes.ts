import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarEstadoComandaSchema, crearComandaSchema } from './comanda.dto';
import * as comandaController from './comanda.controller';

export const comandaRouter = Router();

comandaRouter.use(requireAuth);

comandaRouter.get('/', requirePermission('cocina.ver'), comandaController.listar);
comandaRouter.get(
  '/:id',
  requirePermission('cocina.ver'),
  validateIdParam,
  comandaController.obtener,
);
comandaRouter.post(
  '/',
  requirePermission('pedidos.editar'),
  validateBody(crearComandaSchema),
  comandaController.crear,
);
comandaRouter.put(
  '/:id',
  requirePermission('cocina.editar'),
  validateIdParam,
  validateBody(actualizarEstadoComandaSchema),
  comandaController.actualizarEstado,
);
comandaRouter.delete(
  '/:id',
  requirePermission('cocina.eliminar'),
  validateIdParam,
  comandaController.eliminar,
);
