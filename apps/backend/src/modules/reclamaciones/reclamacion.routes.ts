import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { responderReclamacionSchema } from './reclamacion.dto';
import * as reclamacionController from './reclamacion.controller';

export const reclamacionRouter = Router();

reclamacionRouter.use(requireAuth);

reclamacionRouter.get('/', requirePermission('reclamaciones.ver'), reclamacionController.listar);
reclamacionRouter.get(
  '/:id',
  requirePermission('reclamaciones.ver'),
  validateIdParam,
  reclamacionController.obtener,
);
reclamacionRouter.post(
  '/:id/responder',
  requirePermission('reclamaciones.responder'),
  validateIdParam,
  validateBody(responderReclamacionSchema),
  reclamacionController.responder,
);
