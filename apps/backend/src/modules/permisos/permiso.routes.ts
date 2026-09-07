import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import * as permisoController from './permiso.controller';

export const permisoRouter = Router();

permisoRouter.use(requireAuth);
permisoRouter.get('/', requirePermission('permisos.ver'), permisoController.listar);
