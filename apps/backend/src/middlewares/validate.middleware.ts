import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { HttpError } from '../utils/http-error';

export function validateBody(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      next(new HttpError(400, 'Datos de entrada inválidos', details));
      return;
    }
    req.body = result.data;
    next();
  };
}

const idParamSchema = z.object({ id: z.string().uuid('id debe ser un UUID válido') });

export function validateIdParam(req: Request, _res: Response, next: NextFunction): void {
  const result = idParamSchema.safeParse(req.params);
  if (!result.success) {
    next(new HttpError(400, 'Parámetro inválido', ['id debe ser un UUID válido']));
    return;
  }
  next();
}

/** Igual que `validateIdParam` pero para un parámetro con otro nombre, en rutas anidadas
 * (ej. `/pedidos/:id/detalles/:detalleId`, donde `id` ya se valida con `validateIdParam`). */
export function validateUuidParam(nombre: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const resultado = z
      .string()
      .uuid(`${nombre} debe ser un UUID válido`)
      .safeParse(req.params[nombre]);
    if (!resultado.success) {
      next(new HttpError(400, 'Parámetro inválido', [`${nombre} debe ser un UUID válido`]));
      return;
    }
    next();
  };
}
