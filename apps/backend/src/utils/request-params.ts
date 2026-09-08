import type { Request } from 'express';

/**
 * Lee `req.params.id` como string. Usar solo en rutas protegidas por el
 * middleware `validateIdParam`, que ya garantiza que es un UUID válido.
 */
export function getIdParam(req: Request): string {
  return req.params.id as string;
}

/** Lee un parámetro de ruta distinto de `id` (ej. `detalleId` en rutas anidadas). Usar solo
 * junto con `validateUuidParam(nombre)`, que ya garantiza que es un UUID válido. */
export function getParam(req: Request, nombre: string): string {
  return req.params[nombre] as string;
}
