import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateUuidParam } from '../../middlewares/validate.middleware';
import { ajustarPuntosSchema, canjearPuntosSchema } from './fidelizacion.dto';
import * as fidelizacionController from './fidelizacion.controller';

export const fidelizacionRouter = Router();

fidelizacionRouter.use(requireAuth);

fidelizacionRouter.get(
  '/clientes',
  requirePermission('fidelizacion.ver'),
  fidelizacionController.listarClientes,
);
fidelizacionRouter.get(
  '/clientes/:clienteId',
  requirePermission('fidelizacion.ver'),
  validateUuidParam('clienteId'),
  fidelizacionController.listarMovimientosDeCliente,
);

fidelizacionRouter.post(
  '/canjear',
  requirePermission('fidelizacion.gestionar'),
  validateBody(canjearPuntosSchema),
  fidelizacionController.canjear,
);
fidelizacionRouter.post(
  '/ajustar',
  requirePermission('fidelizacion.gestionar'),
  validateBody(ajustarPuntosSchema),
  fidelizacionController.ajustar,
);
