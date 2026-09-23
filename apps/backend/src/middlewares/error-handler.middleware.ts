import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';
import { sendError } from '../utils/api-response';
import { logger } from '../utils/logger';

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    sendError(res, err.statusCode, err.message, err.details, err.codigo);
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

  // Con el identificador de traza, el usuario puede reportar "me salió este código" y el
  // registro correspondiente aparece de inmediato, en vez de buscar a ciegas por hora.
  logger.error('Error no controlado', err, {
    idTraza: req.idTraza,
    metodo: req.method,
    ruta: req.originalUrl.split('?')[0],
    empresaId: req.usuarioAuth?.empresaId,
  });

  // Fuera de desarrollo nunca se devuelve el mensaje interno: puede filtrar nombres de
  // tablas, rutas del servidor o fragmentos de consultas.
  const message =
    env.nodeEnv === 'development' && err instanceof Error
      ? err.message
      : 'Error interno del servidor';

  sendError(res, 500, message, req.idTraza ? [`Referencia: ${req.idTraza}`] : []);
}
