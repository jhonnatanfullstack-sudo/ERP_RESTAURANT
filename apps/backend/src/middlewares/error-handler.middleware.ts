import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';
import { sendError } from '../utils/api-response';

export function errorHandlerMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    sendError(res, err.statusCode, err.message, err.details);
    return;
  }

  if (err instanceof MulterError) {
    const mensaje =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'La imagen supera el tamaño máximo permitido (5 MB)'
        : 'No se pudo procesar el archivo enviado';
    sendError(res, 400, mensaje);
    return;
  }

  console.error(err);

  const message =
    env.nodeEnv === 'development' && err instanceof Error
      ? err.message
      : 'Error interno del servidor';

  sendError(res, 500, message);
}
