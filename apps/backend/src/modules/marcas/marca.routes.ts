import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarMarcaSchema, crearMarcaSchema } from './marca.dto';
import * as marcaController from './marca.controller';

export const marcaRouter = Router();

marcaRouter.use(requireAuth);

marcaRouter.get('/', requirePermission('marcas.ver'), marcaController.listar);
marcaRouter.get('/:id', requirePermission('marcas.ver'), validateIdParam, marcaController.obtener);
marcaRouter.post(
  '/',
  requirePermission('marcas.crear'),
  validateBody(crearMarcaSchema),
  marcaController.crear,
);
marcaRouter.put(
  '/:id',
  requirePermission('marcas.editar'),
  validateIdParam,
  validateBody(actualizarMarcaSchema),
  marcaController.actualizar,
);
marcaRouter.delete(
  '/:id',
  requirePermission('marcas.eliminar'),
  validateIdParam,
  marcaController.eliminar,
);
