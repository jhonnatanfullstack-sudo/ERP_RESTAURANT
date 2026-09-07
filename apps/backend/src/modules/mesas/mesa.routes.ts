import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarMesaSchema, crearMesaSchema } from './mesa.dto';
import * as mesaController from './mesa.controller';

export const mesaRouter = Router();

mesaRouter.use(requireAuth);

mesaRouter.get('/', requirePermission('mesas.ver'), mesaController.listar);
mesaRouter.get('/:id', requirePermission('mesas.ver'), validateIdParam, mesaController.obtener);
mesaRouter.post(
  '/',
  requirePermission('mesas.crear'),
  validateBody(crearMesaSchema),
  mesaController.crear,
);
mesaRouter.put(
  '/:id',
  requirePermission('mesas.editar'),
  validateIdParam,
  validateBody(actualizarMesaSchema),
  mesaController.actualizar,
);
mesaRouter.delete(
  '/:id',
  requirePermission('mesas.eliminar'),
  validateIdParam,
  mesaController.eliminar,
);
