import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { sendSuccess } from '../../utils/api-response';

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
