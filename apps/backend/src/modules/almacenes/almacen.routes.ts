import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarAlmacenSchema, crearAlmacenSchema } from './almacen.dto';
import * as almacenController from './almacen.controller';

export const almacenRouter = Router();

almacenRouter.use(requireAuth);

almacenRouter.get('/', requirePermission('almacenes.ver'), almacenController.listar);
almacenRouter.get(
  '/:id',
  requirePermission('almacenes.ver'),
  validateIdParam,
  almacenController.obtener,
);
almacenRouter.post(
  '/',
  requirePermission('almacenes.crear'),
  validateBody(crearAlmacenSchema),
  almacenController.crear,
);
almacenRouter.put(
  '/:id',
  requirePermission('almacenes.editar'),
  validateIdParam,
  validateBody(actualizarAlmacenSchema),
  almacenController.actualizar,
);
almacenRouter.delete(
  '/:id',
  requirePermission('almacenes.eliminar'),
  validateIdParam,
  almacenController.eliminar,
);
