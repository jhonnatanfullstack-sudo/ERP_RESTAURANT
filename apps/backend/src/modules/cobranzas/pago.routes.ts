import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { anularPagoSchema } from './cobranza.dto';
import * as cobranzaController from './cobranza.controller';

/** Rutas por id de pago. Van aparte de `cobranzaRouter` (que se monta por id de venta)
 * porque anular apunta al pago, no al documento que amortiza. */
export const pagoRouter = Router();

pagoRouter.use(requireAuth);

pagoRouter.delete(
  '/:id',
  requirePermission('cobranzas.anular'),
  validateIdParam,
  validateBody(anularPagoSchema),
  cobranzaController.anularPago,
);
