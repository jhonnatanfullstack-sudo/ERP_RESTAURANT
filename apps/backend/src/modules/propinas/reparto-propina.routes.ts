import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { crearRepartoSchema } from './reparto-propina.dto';
import * as repartoPropinaController from './reparto-propina.controller';

export const repartoPropinaRouter = Router();

repartoPropinaRouter.use(requireAuth);

// '/vista-previa' debe registrarse antes de '/:id': si no, Express lo trataría como un id.
repartoPropinaRouter.get(
  '/',
  requirePermission('propinas.ver'),
  repartoPropinaController.listar,
);
repartoPropinaRouter.get(
  '/vista-previa',
  requirePermission('propinas.repartir'),
  repartoPropinaController.vistaPrevia,
);
repartoPropinaRouter.get(
  '/:id',
  requirePermission('propinas.ver'),
  validateIdParam,
  repartoPropinaController.obtener,
);

repartoPropinaRouter.post(
  '/',
  requirePermission('propinas.repartir'),
  validateBody(crearRepartoSchema),
  repartoPropinaController.crear,
);
