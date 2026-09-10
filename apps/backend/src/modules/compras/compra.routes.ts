import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { crearCompraSchema } from './compra.dto';
import * as compraController from './compra.controller';

export const compraRouter = Router();

compraRouter.use(requireAuth);

compraRouter.get('/', requirePermission('compras.ver'), compraController.listar);
compraRouter.get(
  '/:id',
  requirePermission('compras.ver'),
  validateIdParam,
  compraController.obtener,
);
compraRouter.post(
  '/',
  requirePermission('compras.crear'),
  validateBody(crearCompraSchema),
  compraController.crear,
);
compraRouter.put(
  '/:id',
  requirePermission('compras.editar'),
  validateIdParam,
  validateBody(crearCompraSchema),
  compraController.actualizar,
);
compraRouter.post(
  '/:id/anular',
  requirePermission('compras.anular'),
  validateIdParam,
  compraController.anular,
);
