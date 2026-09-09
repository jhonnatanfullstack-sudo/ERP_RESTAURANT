import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validate.middleware';
import { registrarMovimientoSchema } from './existencia.dto';
import * as existenciaController from './existencia.controller';

export const existenciaRouter = Router();

existenciaRouter.use(requireAuth);

existenciaRouter.get(
  '/stock',
  requirePermission('inventario.ver'),
  existenciaController.listarStock,
);
existenciaRouter.get(
  '/movimientos',
  requirePermission('inventario.ver'),
  existenciaController.listarMovimientos,
);
existenciaRouter.post(
  '/movimientos',
  requirePermission('inventario.ajustar'),
  validateBody(registrarMovimientoSchema),
  existenciaController.registrarMovimiento,
);
