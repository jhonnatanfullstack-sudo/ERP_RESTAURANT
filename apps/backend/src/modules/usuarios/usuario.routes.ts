import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarUsuarioSchema, crearUsuarioSchema } from './usuario.dto';
import * as usuarioController from './usuario.controller';

export const usuarioRouter = Router();

usuarioRouter.use(requireAuth);

usuarioRouter.get('/', requirePermission('usuarios.ver'), usuarioController.listar);
usuarioRouter.get(
  '/:id',
  requirePermission('usuarios.ver'),
  validateIdParam,
  usuarioController.obtener,
);
usuarioRouter.post(
  '/',
  requirePermission('usuarios.crear'),
  validateBody(crearUsuarioSchema),
  usuarioController.crear,
);
usuarioRouter.put(
  '/:id',
  requirePermission('usuarios.editar'),
  validateIdParam,
  validateBody(actualizarUsuarioSchema),
  usuarioController.actualizar,
);
usuarioRouter.delete(
  '/:id',
  requirePermission('usuarios.eliminar'),
  validateIdParam,
  usuarioController.eliminar,
);
