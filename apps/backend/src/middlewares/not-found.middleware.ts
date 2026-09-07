import type { Request, Response } from 'express';
import { sendError } from '../utils/api-response';

export function notFoundMiddleware(req: Request, res: Response): void {
  sendError(res, 404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`);
}
