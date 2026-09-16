import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody, validateIdParam } from '../../middlewares/validate.middleware';
import { abrirTurnoSchema, cerrarTurnoSchema } from './turno.dto';
import * as turnoController from './turno.controller';

export const turnoRouter = Router();

turnoRouter.use(requireAuth);

// '/mi-turno' debe registrarse antes de '/:id': si no, Express lo trataría como un id.
turnoRouter.get('/', requirePermission('turnos.ver'), turnoController.listar);
turnoRouter.get('/mi-turno', requirePermission('turnos.ver'), turnoController.obtenerMiTurno);
turnoRouter.get('/:id', requirePermission('turnos.ver'), validateIdParam, turnoController.obtener);

turnoRouter.post(
  '/abrir',
  requirePermission('turnos.abrir'),
  validateBody(abrirTurnoSchema),
  turnoController.abrir,
);

turnoRouter.post(
  '/:id/cerrar',
  requirePermission('turnos.cerrar'),
  validateIdParam,
  validateBody(cerrarTurnoSchema),
  turnoController.cerrar,
);
