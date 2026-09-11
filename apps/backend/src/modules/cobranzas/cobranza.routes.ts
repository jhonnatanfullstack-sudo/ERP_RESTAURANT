import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { registrarPagoSchema } from './cobranza.dto';
import * as cobranzaController from './cobranza.controller';

export const cobranzaRouter = Router();

cobranzaRouter.use(requireAuth);

cobranzaRouter.get('/', requirePermission('cobranzas.ver'), cobranzaController.listar);
cobranzaRouter.get(
  '/:id',
  requirePermission('cobranzas.ver'),
  validateIdParam,
  cobranzaController.obtener,
);
cobranzaRouter.post(
  '/:id/pagos',
  requirePermission('cobranzas.registrar'),
  validateIdParam,
  validateBody(registrarPagoSchema),
  cobranzaController.registrarPago,
);
