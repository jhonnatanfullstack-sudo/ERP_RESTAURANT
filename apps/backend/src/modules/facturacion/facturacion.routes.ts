import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import {
  validateBody,
  validateUuidParam,
  validateIdParam,
} from '../../middlewares/validate.middleware';
import { uploaderCertificado } from '../../config/uploads';
import { guardarConfiguracionFacturacionSchema } from './facturacion.dto';
import * as facturacionController from './facturacion.controller';

export const facturacionRouter = Router();

facturacionRouter.use(requireAuth);

facturacionRouter.get(
  '/configuracion',
  requirePermission('facturacion.ver'),
  facturacionController.obtenerConfiguracion,
);
facturacionRouter.put(
  '/configuracion',
  requirePermission('facturacion.configurar'),
  validateBody(guardarConfiguracionFacturacionSchema),
  facturacionController.guardarConfiguracion,
);
facturacionRouter.post(
  '/configuracion/certificado',
  requirePermission('facturacion.configurar'),
  uploaderCertificado.single('certificado'),
  facturacionController.subirCertificado,
);

facturacionRouter.get(
  '/ventas/:ventaId',
  requirePermission('facturacion.ver'),
  validateUuidParam('ventaId'),
  facturacionController.obtenerComprobanteDeVenta,
);
facturacionRouter.post(
  '/ventas/:ventaId/emitir',
  requirePermission('facturacion.emitir'),
  validateUuidParam('ventaId'),
  facturacionController.emitir,
);
facturacionRouter.post(
  '/comprobantes/:id/reintentar',
  requirePermission('facturacion.emitir'),
  validateIdParam,
  facturacionController.reintentar,
);
