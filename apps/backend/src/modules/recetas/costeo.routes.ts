import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateUuidParam } from '../../middlewares/validate.middleware';
import * as costeoController from './costeo.controller';

/**
 * Costeo y márgenes (FASE 18). Recurso propio y no un sub-recurso de `/api/recetas` porque
 * cubre también a las mercaderías (que no tienen receta) y porque se protege con su propio
 * permiso: quién puede editar la receta de un platillo no es necesariamente quién puede ver
 * cuánto gana el negocio con él.
 */
export const costeoRouter = Router();

costeoRouter.use(requireAuth);

costeoRouter.get('/', requirePermission('costos.ver'), costeoController.listar);
costeoRouter.get(
  '/:productoId',
  requirePermission('costos.ver'),
  validateUuidParam('productoId'),
  costeoController.obtener,
);
