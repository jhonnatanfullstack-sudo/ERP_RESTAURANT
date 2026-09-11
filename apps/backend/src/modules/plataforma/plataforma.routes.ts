import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validateBody, validateUuidParam } from '../../middlewares/validate.middleware';
import { requireProveedor } from './plataforma.middleware';
import { accionEmpresaSchema } from './plataforma.dto';
import * as proveedorController from './plataforma.controller';

/**
 * Panel del proveedor del sistema: el único recurso que atraviesa el aislamiento entre
 * empresas. No usa el catálogo de permisos (`requirePermission`) a propósito — los permisos
 * son del RBAC **interno de cada restaurante**, y ningún rol de un restaurante debería poder
 * contener un permiso que le deje ver a los demás. La marca `usuarios.es_proveedor`, que
 * solo se pone por migración, es un eje distinto.
 */
export const plataformaRouter = Router();

plataformaRouter.use(requireAuth, requireProveedor);

plataformaRouter.get('/panel', proveedorController.panel);
plataformaRouter.get(
  '/empresas/:empresaId/uso',
  validateUuidParam('empresaId'),
  proveedorController.usoDiario,
);
plataformaRouter.post(
  '/empresas/:empresaId/acciones',
  validateUuidParam('empresaId'),
  validateBody(accionEmpresaSchema),
  proveedorController.accion,
);
