import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateBody } from '../../middlewares/validate.middleware';
import { registrarDemoSchema } from './demo.dto';
import * as demoController from './demo.controller';

export const demoRouter = Router();

/**
 * Alta de cuentas de prueba. Es el único endpoint de escritura **sin autenticación** del
 * sistema, así que lleva su propio límite, mucho más estricto que el global: cada alta crea
 * una empresa entera (rol, usuario, almacén), y sin freno una sola IP podría llenar la base
 * de empresas basura en minutos. El RUC único ya limita a una cuenta por negocio real; esto
 * limita el ritmo de intentos.
 */
const registroRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  // En las pruebas cada caso que necesita un segundo restaurante crea uno por este mismo
  // endpoint: con el límite activo, a partir del sexto todo fallaría con 429 y las pruebas
  // dejarían de hablar de lo que pretenden probar.
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados registros desde esta conexión, intenta de nuevo en una hora',
    details: [],
  },
});

demoRouter.get('/informacion', demoController.informacion);
demoRouter.get('/tipos-documento', demoController.tiposDocumento);
demoRouter.get('/paises', demoController.paises);
demoRouter.get('/divisiones-administrativas', demoController.divisionesAdministrativas);
demoRouter.post(
  '/registrar',
  registroRateLimit,
  validateBody(registrarDemoSchema),
  demoController.registrar,
);
