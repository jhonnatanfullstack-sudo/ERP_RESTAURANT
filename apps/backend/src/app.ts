import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env';
import { UPLOADS_DIR } from './config/uploads';
import { apiRouter } from './routes';
import { transaccionPorPeticionMiddleware } from './middlewares/tenant.middleware';
import { auditoriaMiddleware } from './modules/auditoria/auditoria.middleware';
import { notFoundMiddleware } from './middlewares/not-found.middleware';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware';
import { peticionMiddleware } from './middlewares/peticion.middleware';
import { saludRouter } from './routes/salud.routes';

export const app: Application = express();

// Detrás de un balanceador (cualquier PaaS), Express necesita confiar en `X-Forwarded-For`
// para conocer la IP real del cliente. Sin esto el limitador de peticiones trata a todos los
// visitantes como uno solo y los bloquea en conjunto. Ver `docs/despliegue.md`.
if (env.trustProxy > 0) {
  app.set('trust proxy', env.trustProxy);
}

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(
  rateLimit({
    // Los health checks del orquestador llegan cada pocos segundos desde la misma IP: no
    // tiene sentido contarlos contra el límite de los usuarios.
    skip: (req) => req.path.startsWith('/health'),
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Identificador de traza y registro de cada petición. Va al principio para que cubra
// también las respuestas del limitador y de los errores de análisis del cuerpo.
app.use(peticionMiddleware);

// Fuera de `/api` y sin autenticación: los health checks los consulta el orquestador, no un
// usuario. `/health` = el proceso vive; `/health/listo` = además la base responde.
app.use(saludRouter);

app.use(
  '/uploads',
  (_req, res, next) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(UPLOADS_DIR),
);

// Primero de todo en /api: abre la transacción donde vive `app.empresa_id`, el ajuste que
// activa el aislamiento entre empresas. Nada que toque datos puede correr antes.
app.use('/api', transaccionPorPeticionMiddleware);

// Antes del router para poder engancharse al ciclo de la petición, pero el registro real
// ocurre al terminar la respuesta, cuando ya se conoce el usuario autenticado y el resultado.
app.use('/api', auditoriaMiddleware);
app.use('/api', apiRouter);

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);
