import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import {
  actualizarTalonarioSchema,
  asignarUsuariosSchema,
  crearTalonarioSchema,
} from './talonario.dto';
import * as talonarioController from './talonario.controller';

export const talonarioRouter = Router();

talonarioRouter.use(requireAuth);

// Antes de `/:id` para que "mios" no se interprete como un id.
talonarioRouter.get('/mios', requirePermission('ventas.crear'), talonarioController.listarMios);

talonarioRouter.get('/', requirePermission('talonarios.ver'), talonarioController.listar);
talonarioRouter.get(
  '/:id',
  requirePermission('talonarios.ver'),
  validateIdParam,
  talonarioController.obtener,
);
talonarioRouter.post(
  '/',
  requirePermission('talonarios.crear'),
  validateBody(crearTalonarioSchema),
  talonarioController.crear,
);
talonarioRouter.put(
  '/:id',
  requirePermission('talonarios.editar'),
  validateIdParam,
  validateBody(actualizarTalonarioSchema),
  talonarioController.actualizar,
);
talonarioRouter.put(
  '/:id/usuarios',
  requirePermission('talonarios.asignar'),
  validateIdParam,
  validateBody(asignarUsuariosSchema),
  talonarioController.asignarUsuarios,
);
talonarioRouter.delete(
  '/:id',
  requirePermission('talonarios.eliminar'),
  validateIdParam,
  talonarioController.eliminar,
);
