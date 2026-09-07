import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarReservaSchema, crearReservaSchema } from './reserva.dto';
import * as reservaController from './reserva.controller';

export const reservaRouter = Router();

reservaRouter.use(requireAuth);

reservaRouter.get('/', requirePermission('reservas.ver'), reservaController.listar);
reservaRouter.get(
  '/:id',
  requirePermission('reservas.ver'),
  validateIdParam,
  reservaController.obtener,
);
reservaRouter.post(
  '/',
  requirePermission('reservas.crear'),
  validateBody(crearReservaSchema),
  reservaController.crear,
);
reservaRouter.put(
  '/:id',
  requirePermission('reservas.editar'),
  validateIdParam,
  validateBody(actualizarReservaSchema),
  reservaController.actualizar,
);
reservaRouter.delete(
  '/:id',
  requirePermission('reservas.eliminar'),
  validateIdParam,
  reservaController.eliminar,
);
