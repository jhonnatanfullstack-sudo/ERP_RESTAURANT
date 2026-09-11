import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarEmpresaSchema, crearEmpresaSchema } from './empresa.dto';
import * as empresaController from './empresa.controller';

export const empresaRouter = Router();

// Sin autenticación: datos de contacto para la carta pública (nombre, dirección, teléfono,
// logo). Debe registrarse antes de empresaRouter.use(requireAuth) — mismo patrón que
// La carta pública se movió a `/api/publico/:slug/empresa` (ver `modules/carta-publica`):
// con varias empresas en el sistema, "la empresa pública" dejó de ser una sola.

empresaRouter.use(requireAuth);

empresaRouter.get('/', requirePermission('empresa.ver'), empresaController.listar);
empresaRouter.get(
  '/:id',
  requirePermission('empresa.ver'),
  validateIdParam,
  empresaController.obtener,
);
empresaRouter.post(
  '/',
  requirePermission('empresa.crear'),
  validateBody(crearEmpresaSchema),
  empresaController.crear,
);
empresaRouter.put(
  '/:id',
  requirePermission('empresa.editar'),
  validateIdParam,
  validateBody(actualizarEmpresaSchema),
  empresaController.actualizar,
);
