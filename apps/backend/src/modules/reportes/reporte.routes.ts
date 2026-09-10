import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import * as reporteController from './reporte.controller';

export const reporteRouter = Router();

reporteRouter.use(requireAuth);

// El rango llega por querystring (`?desde=&hasta=`), no por body: es una consulta GET
// cacheable y enlazable, y `validateBody` no aplica a query params.
reporteRouter.get('/', requirePermission('reportes.ver'), reporteController.obtener);
