import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env';
import { apiRouter } from './routes';
import { notFoundMiddleware } from './middlewares/not-found.middleware';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware';
import { sendSuccess } from './utils/api-response';

export const app: Application = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/health', (_req, res) => {
  sendSuccess(res, { status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', apiRouter);

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);
