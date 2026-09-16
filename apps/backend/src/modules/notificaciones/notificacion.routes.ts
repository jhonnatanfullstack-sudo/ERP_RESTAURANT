import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateIdParam } from '../../middlewares/validate.middleware';
import * as notificacionController from './notificacion.controller';

export const notificacionRouter = Router();

notificacionRouter.use(requireAuth);
notificacionRouter.use(requirePermission('notificaciones.ver'));

// '/no-leidas' y '/leer-todas' deben registrarse antes de '/:id': si no, Express los trataría
// como un id.
notificacionRouter.get('/', notificacionController.listar);
notificacionRouter.get('/no-leidas', notificacionController.contarNoLeidas);
notificacionRouter.post('/leer-todas', notificacionController.marcarTodasLeidas);
notificacionRouter.post('/:id/leer', validateIdParam, notificacionController.marcarLeida);
