import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarProveedorSchema, crearProveedorSchema } from './proveedor.dto';
import * as proveedorController from './proveedor.controller';

export const proveedorRouter = Router();

proveedorRouter.use(requireAuth);

// Antes de '/:id' — si no, Express lo trataría como un id.
proveedorRouter.get(
  '/consulta-documento',
  requirePermission('proveedores.crear'),
  proveedorController.consultarDocumentoExterno,
);

proveedorRouter.get('/', requirePermission('proveedores.ver'), proveedorController.listar);
proveedorRouter.get(
  '/:id',
  requirePermission('proveedores.ver'),
  validateIdParam,
  proveedorController.obtener,
);
proveedorRouter.post(
  '/',
  requirePermission('proveedores.crear'),
  validateBody(crearProveedorSchema),
  proveedorController.crear,
);
proveedorRouter.put(
  '/:id',
  requirePermission('proveedores.editar'),
  validateIdParam,
  validateBody(actualizarProveedorSchema),
  proveedorController.actualizar,
);
proveedorRouter.delete(
  '/:id',
  requirePermission('proveedores.eliminar'),
  validateIdParam,
  proveedorController.eliminar,
);
