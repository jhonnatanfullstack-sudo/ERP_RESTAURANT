import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import * as auditoriaController from './auditoria.controller';

export const auditoriaRouter = Router();

auditoriaRouter.use(requireAuth);

// Solo lectura: la bitácora no se edita ni se borra desde la aplicación, o dejaría de servir
// como auditoría.
auditoriaRouter.get('/', requirePermission('auditoria.ver'), auditoriaController.listar);
auditoriaRouter.get('/modulos', requirePermission('auditoria.ver'), auditoriaController.modulos);
