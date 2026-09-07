import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarPersonalSchema, crearPersonalSchema } from './personal.dto';
import * as personalController from './personal.controller';

export const personalRouter = Router();

personalRouter.use(requireAuth);

personalRouter.get('/', requirePermission('personal.ver'), personalController.listar);
personalRouter.get(
  '/:id',
  requirePermission('personal.ver'),
  validateIdParam,
  personalController.obtener,
);
personalRouter.post(
  '/',
  requirePermission('personal.crear'),
  validateBody(crearPersonalSchema),
  personalController.crear,
);
personalRouter.put(
  '/:id',
  requirePermission('personal.editar'),
  validateIdParam,
  validateBody(actualizarPersonalSchema),
  personalController.actualizar,
);
personalRouter.delete(
  '/:id',
  requirePermission('personal.eliminar'),
  validateIdParam,
  personalController.eliminar,
);
