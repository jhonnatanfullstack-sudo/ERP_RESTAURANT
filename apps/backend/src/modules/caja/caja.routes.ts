import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { abrirCajaSchema, cerrarCajaSchema, registrarMovimientoSchema } from './caja.dto';
import * as cajaController from './caja.controller';

export const cajaRouter = Router();

cajaRouter.use(requireAuth);

// '/actual' debe registrarse antes de '/:id': si no, Express lo trataría como un id.
cajaRouter.get('/', requirePermission('caja.ver'), cajaController.listar);
cajaRouter.get('/actual', requirePermission('caja.ver'), cajaController.obtenerActual);
cajaRouter.get('/:id', requirePermission('caja.ver'), validateIdParam, cajaController.obtener);

cajaRouter.post(
  '/abrir',
  requirePermission('caja.abrir'),
  validateBody(abrirCajaSchema),
  cajaController.abrir,
);

cajaRouter.post(
  '/:id/cerrar',
  requirePermission('caja.cerrar'),
  validateIdParam,
  validateBody(cerrarCajaSchema),
  cajaController.cerrar,
);

// Registrar un movimiento es operar una caja ya abierta: mismo permiso que abrirla, en vez de
// inventar un cuarto código de permiso que CLAUDE.md no predefine para este módulo (solo
// caja.ver/abrir/cerrar) — ver decisiones-tecnicas.md.
cajaRouter.post(
  '/:id/movimientos',
  requirePermission('caja.abrir'),
  validateIdParam,
  validateBody(registrarMovimientoSchema),
  cajaController.registrarMovimiento,
);
