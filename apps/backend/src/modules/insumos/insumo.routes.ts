import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarInsumoSchema, crearInsumoSchema } from './insumo.dto';
import * as insumoController from './insumo.controller';

export const insumoRouter = Router();

insumoRouter.use(requireAuth);

insumoRouter.get('/', requirePermission('insumos.ver'), insumoController.listar);
insumoRouter.get(
  '/:id',
  requirePermission('insumos.ver'),
  validateIdParam,
  insumoController.obtener,
);
insumoRouter.post(
  '/',
  requirePermission('insumos.crear'),
  validateBody(crearInsumoSchema),
  insumoController.crear,
);
insumoRouter.put(
  '/:id',
  requirePermission('insumos.editar'),
  validateIdParam,
  validateBody(actualizarInsumoSchema),
  insumoController.actualizar,
);
insumoRouter.delete(
  '/:id',
  requirePermission('insumos.eliminar'),
  validateIdParam,
  insumoController.eliminar,
);
