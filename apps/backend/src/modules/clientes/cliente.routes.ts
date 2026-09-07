import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { actualizarClienteSchema, crearClienteSchema } from './cliente.dto';
import * as clienteController from './cliente.controller';

export const clienteRouter = Router();

clienteRouter.use(requireAuth);

clienteRouter.get(
  '/consulta-documento',
  requirePermission('clientes.crear'),
  clienteController.consultarDocumentoExterno,
);

clienteRouter.get('/', requirePermission('clientes.ver'), clienteController.listar);
clienteRouter.get(
  '/:id',
  requirePermission('clientes.ver'),
  validateIdParam,
  clienteController.obtener,
);
clienteRouter.post(
  '/',
  requirePermission('clientes.crear'),
  validateBody(crearClienteSchema),
  clienteController.crear,
);
clienteRouter.put(
  '/:id',
  requirePermission('clientes.editar'),
  validateIdParam,
  validateBody(actualizarClienteSchema),
  clienteController.actualizar,
);
clienteRouter.delete(
  '/:id',
  requirePermission('clientes.eliminar'),
  validateIdParam,
  clienteController.eliminar,
);
