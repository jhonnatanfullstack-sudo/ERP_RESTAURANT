import type { Request } from 'express';

/**
 * Lee `req.params.id` como string. Usar solo en rutas protegidas por el
 * middleware `validateIdParam`, que ya garantiza que es un UUID válido.
 */
export function getIdParam(req: Request): string {
  return req.params.id as string;
}
