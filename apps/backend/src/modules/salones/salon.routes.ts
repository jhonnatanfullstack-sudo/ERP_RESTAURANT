import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarSalonSchema, crearSalonSchema } from './salon.dto';
import * as salonController from './salon.controller';

export const salonRouter = Router();

salonRouter.use(requireAuth);

salonRouter.get('/', requirePermission('salones.ver'), salonController.listar);
salonRouter.get('/:id', requirePermission('salones.ver'), validateIdParam, salonController.obtener);
salonRouter.post(
  '/',
  requirePermission('salones.crear'),
  validateBody(crearSalonSchema),
  salonController.crear,
);
salonRouter.put(
  '/:id',
  requirePermission('salones.editar'),
  validateIdParam,
  validateBody(actualizarSalonSchema),
  salonController.actualizar,
);
salonRouter.delete(
  '/:id',
  requirePermission('salones.eliminar'),
  validateIdParam,
  salonController.eliminar,
);
