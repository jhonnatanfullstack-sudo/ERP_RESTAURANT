import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';
import { verifyAccessToken } from '../utils/jwt';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, 'No autenticado'));
    return;
  }

  const token = header.slice('Bearer '.length);
  try {
    req.usuarioAuth = verifyAccessToken(token);
    next();
  } catch {
    next(new HttpError(401, 'Token inválido o expirado'));
  }
}

export function requirePermission(codigoPermiso: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.usuarioAuth) {
      next(new HttpError(401, 'No autenticado'));
      return;
    }
    if (!req.usuarioAuth.permisos.includes(codigoPermiso)) {
      next(new HttpError(403, 'No tiene permiso para realizar esta acción'));
      return;
    }
    next();
  };
}
