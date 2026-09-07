import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarCategoriaSchema, crearCategoriaSchema } from './categoria.dto';
import * as categoriaController from './categoria.controller';

export const categoriaRouter = Router();

categoriaRouter.use(requireAuth);

categoriaRouter.get('/', requirePermission('categorias.ver'), categoriaController.listar);
categoriaRouter.get(
  '/:id',
  requirePermission('categorias.ver'),
  validateIdParam,
  categoriaController.obtener,
);
categoriaRouter.post(
  '/',
  requirePermission('categorias.crear'),
  validateBody(crearCategoriaSchema),
  categoriaController.crear,
);
categoriaRouter.put(
  '/:id',
  requirePermission('categorias.editar'),
  validateIdParam,
  validateBody(actualizarCategoriaSchema),
  categoriaController.actualizar,
);
categoriaRouter.delete(
  '/:id',
  requirePermission('categorias.eliminar'),
  validateIdParam,
  categoriaController.eliminar,
);
