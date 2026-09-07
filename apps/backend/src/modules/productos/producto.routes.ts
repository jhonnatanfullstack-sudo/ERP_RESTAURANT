import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { crearUploaderImagen } from '../../config/uploads';
import { actualizarProductoSchema, crearProductoSchema } from './producto.dto';
import * as productoController from './producto.controller';

export const productoRouter = Router();

const uploaderImagenProducto = crearUploaderImagen('productos');

productoRouter.get('/publico', productoController.listarPublico);

productoRouter.use(requireAuth);

productoRouter.get('/', requirePermission('productos.ver'), productoController.listar);
productoRouter.get(
  '/:id',
  requirePermission('productos.ver'),
  validateIdParam,
  productoController.obtener,
);
productoRouter.post(
  '/',
  requirePermission('productos.crear'),
  validateBody(crearProductoSchema),
  productoController.crear,
);
productoRouter.put(
  '/:id',
  requirePermission('productos.editar'),
  validateIdParam,
  validateBody(actualizarProductoSchema),
  productoController.actualizar,
);
productoRouter.delete(
  '/:id',
  requirePermission('productos.eliminar'),
  validateIdParam,
  productoController.eliminar,
);
productoRouter.post(
  '/:id/imagen',
  requirePermission('productos.editar'),
  validateIdParam,
  uploaderImagenProducto.single('imagen'),
  productoController.subirImagen,
);
