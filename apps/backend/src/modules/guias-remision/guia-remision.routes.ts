import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { crearGuiaRemisionSchema } from './guia-remision.dto';
import * as guiaRemisionController from './guia-remision.controller';

export const guiaRemisionRouter = Router();

guiaRemisionRouter.use(requireAuth);

guiaRemisionRouter.get(
  '/',
  requirePermission('guias_remision.ver'),
  guiaRemisionController.listar,
);
guiaRemisionRouter.get(
  '/:id',
  requirePermission('guias_remision.ver'),
  validateIdParam,
  guiaRemisionController.obtener,
);
guiaRemisionRouter.post(
  '/',
  requirePermission('guias_remision.crear'),
  validateBody(crearGuiaRemisionSchema),
  guiaRemisionController.crear,
);
guiaRemisionRouter.post(
  '/:id/emitir',
  requirePermission('guias_remision.emitir'),
  validateIdParam,
  guiaRemisionController.emitir,
);
guiaRemisionRouter.post(
  '/:id/reintentar',
  requirePermission('guias_remision.emitir'),
  validateIdParam,
  guiaRemisionController.reintentar,
);
