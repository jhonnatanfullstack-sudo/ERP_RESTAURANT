import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../utils/http-error';
import { usuarioRepository } from '../usuarios/usuario.repository';

/**
 * Restringe una ruta al proveedor del sistema.
 *
 * La marca se lee de la base en cada petición y **no** del token: si viajara en el JWT, un
 * token emitido antes de retirarle la condición de proveedor a alguien seguiría dándole
 * acceso a los datos de todas las empresas hasta expirar. Para el único punto del sistema
 * que atraviesa el aislamiento, esa ventana no es aceptable; la consulta es una lectura por
 * clave primaria dentro de la transacción que la petición ya tiene abierta.
 */
export function requireProveedor(req: Request, _res: Response, next: NextFunction): void {
  const usuarioId = req.usuarioAuth?.sub;
  if (!usuarioId) {
    next(new HttpError(401, 'No autenticado'));
    return;
  }

  usuarioRepository
    .findOne({ where: { id: usuarioId }, select: { id: true, esProveedor: true, activo: true } })
    .then((usuario) => {
      if (!usuario?.esProveedor || !usuario.activo) {
        // 404 y no 403: a quien no es proveedor no se le confirma siquiera que el panel exista.
        next(new HttpError(404, 'Recurso no encontrado'));
        return;
      }
      next();
    })
    .catch(next);
}
