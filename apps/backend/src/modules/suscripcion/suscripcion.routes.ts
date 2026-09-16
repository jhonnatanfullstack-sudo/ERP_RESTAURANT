import { Router } from 'express';
import { requireAuth, requirePermission } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validate.middleware';
import { sendSuccess } from '../../utils/api-response';
import { crearSolicitudSchema } from './solicitud-suscripcion.dto';
import { listarPlanesPublico } from './planes';
import * as suscripcionService from './suscripcion.service';

export const suscripcionRouter = Router();

/**
 * Estado de la suscripción de la empresa del usuario. No lleva `requirePermission`: cualquier
 * persona del restaurante tiene que poder ver cuántos días le quedan y a quién contactar,
 * incluso (sobre todo) cuando la cuenta ya venció — por eso esta ruta está en la lista de
 * las que siguen disponibles con la cuenta bloqueada (`auth.middleware.ts`).
 *
 * `requireAuth` ya lo resolvió al validar el token, así que no hace falta volver a consultar.
 */
suscripcionRouter.get('/', requireAuth, (req, res) => {
  sendSuccess(res, req.suscripcion);
});

/** Catálogo de planes con precio por ciclo — público, lo consume `/precios` sin sesión. */
suscripcionRouter.get('/planes', (_req, res) => {
  sendSuccess(res, listarPlanesPublico());
});

/** Pedir contratar/renovar un plan. Requiere `empresa.editar`: es un compromiso de pago, no
 * una simple consulta — mismo permiso que ya gobierna los datos legales de la empresa. */
suscripcionRouter.post(
  '/solicitar',
  requireAuth,
  requirePermission('empresa.editar'),
  validateBody(crearSolicitudSchema),
  async (req, res, next) => {
    try {
      const solicitud = await suscripcionService.solicitarSuscripcion(req.body);
      sendSuccess(res, solicitud, 'Solicitud enviada', 201);
    } catch (error) {
      next(error);
    }
  },
);

suscripcionRouter.get('/solicitudes', requireAuth, async (_req, res, next) => {
  try {
    sendSuccess(res, await suscripcionService.listarMisSolicitudes());
  } catch (error) {
    next(error);
  }
});
