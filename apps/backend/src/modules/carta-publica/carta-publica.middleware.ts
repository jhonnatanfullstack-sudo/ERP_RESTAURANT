import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../../utils/http-error';
import { conBypassRls, establecerEmpresaDeLaPeticion } from '../../database/tenant-context';
import { empresaRepository } from '../empresa/empresa.repository';

/**
 * Resuelve de qué restaurante es la carta que se está pidiendo, a partir del slug de la URL.
 *
 * En las rutas autenticadas la empresa sale del token; acá no hay token —es un cliente
 * mirando el menú desde su celular— así que **el slug de la URL es la única fuente posible**.
 * Que el visitante pueda cambiarlo y ver la carta de otro restaurante no es un problema: una
 * carta es información pública, y este resolvedor solo habilita los dos endpoints de solo
 * lectura del menú, nunca el resto de la API.
 *
 * Una empresa suspendida o inactiva deja de publicar su carta: si el sistema está cortado,
 * los precios que se mostrarían podrían estar desactualizados.
 */
export function resolverEmpresaPorSlug(req: Request, _res: Response, next: NextFunction): void {
  const slug = req.params.slug;
  if (typeof slug !== 'string' || !slug) {
    next(new HttpError(404, 'Carta no encontrada'));
    return;
  }

  void (async () => {
    try {
      const empresa = await conBypassRls(() => empresaRepository.findOneBy({ slug }));
      if (!empresa || !empresa.activo || empresa.suspendida) {
        throw new HttpError(404, 'Carta no encontrada');
      }
      await establecerEmpresaDeLaPeticion(empresa.id);
      next();
    } catch (error) {
      next(error);
    }
  })();
}
