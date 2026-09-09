import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateUuidParam } from '../../middlewares/validate.middleware';
import { reemplazarRecetaSchema } from './receta.dto';
import * as recetaController from './receta.controller';

export const recetaRouter = Router();

recetaRouter.use(requireAuth);

recetaRouter.get(
  '/:productoId',
  requirePermission('productos.ver'),
  validateUuidParam('productoId'),
  recetaController.obtener,
);
recetaRouter.put(
  '/:productoId',
  requirePermission('productos.editar'),
  validateUuidParam('productoId'),
  validateBody(reemplazarRecetaSchema),
  recetaController.reemplazar,
);
