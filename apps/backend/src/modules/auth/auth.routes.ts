import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validateBody } from '../../middlewares/validate.middleware';
import { cambiarPasswordSchema, loginSchema } from './auth.dto';
import * as authController from './auth.controller';

export const authRouter = Router();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Las pruebas integrales inician sesión decenas de veces desde la misma "IP": con el
  // límite activo empezarían a fallar con 429 a mitad de la suite, hablando de algo que no
  // es lo que pretenden probar.
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Demasiados intentos, intente más tarde', details: [] },
});

authRouter.post('/login', loginRateLimit, validateBody(loginSchema), authController.login);
authRouter.post('/refresh', authController.refrescar);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', requireAuth, authController.me);
authRouter.post(
  '/cambiar-password',
  requireAuth,
  validateBody(cambiarPasswordSchema),
  authController.cambiarPassword,
);
