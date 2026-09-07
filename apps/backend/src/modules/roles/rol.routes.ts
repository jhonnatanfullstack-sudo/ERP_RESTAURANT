import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarRolSchema, asignarPermisosSchema, crearRolSchema } from './rol.dto';
import * as rolController from './rol.controller';

export const rolRouter = Router();

rolRouter.use(requireAuth);

rolRouter.get('/', requirePermission('roles.ver'), rolController.listar);
rolRouter.get('/:id', requirePermission('roles.ver'), validateIdParam, rolController.obtener);
rolRouter.post(
  '/',
  requirePermission('roles.crear'),
  validateBody(crearRolSchema),
  rolController.crear,
);
rolRouter.put(
  '/:id',
  requirePermission('roles.editar'),
  validateIdParam,
  validateBody(actualizarRolSchema),
  rolController.actualizar,
);
rolRouter.put(
  '/:id/permisos',
  requirePermission('roles.editar'),
  validateIdParam,
  validateBody(asignarPermisosSchema),
  rolController.asignarPermisos,
);
