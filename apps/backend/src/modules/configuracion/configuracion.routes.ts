import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateEnumParam } from '../../middlewares/validate.middleware';
import { crearUploaderImagen } from '../../config/uploads';
import { actualizarConfiguracionSchema } from './configuracion.dto';
import * as configuracionController from './configuracion.controller';

const uploaderQrPago = crearUploaderImagen('qr-pago');

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
configuracionRouter.post(
  '/qr-pago/:medio',
  requirePermission('configuracion.editar'),
  validateEnumParam('medio', ['yape', 'plin']),
  uploaderQrPago.single('qr'),
  configuracionController.subirQrPago,
);
