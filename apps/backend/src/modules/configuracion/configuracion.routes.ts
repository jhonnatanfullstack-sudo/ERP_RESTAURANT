import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validate.middleware';
import { actualizarConfiguracionSchema } from './configuracion.dto';
import * as configuracionController from './configuracion.controller';

/**
 * Parámetros operativos del restaurante (FASE 21). Es un recurso singular —no hay una lista
 * de configuraciones, hay **la** configuración de la empresa— así que no lleva `:id`: la
 * empresa sale del token, como en todo el resto de la API.
 */
export const configuracionRouter = Router();

configuracionRouter.use(requireAuth);

configuracionRouter.get(
  '/',
  requirePermission('configuracion.ver'),
  configuracionController.obtener,
);
configuracionRouter.put(
  '/',
  requirePermission('configuracion.editar'),
  validateBody(actualizarConfiguracionSchema),
  configuracionController.actualizar,
);
