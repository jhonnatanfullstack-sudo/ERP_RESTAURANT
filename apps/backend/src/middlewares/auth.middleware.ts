import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';
import { verifyAccessToken } from '../utils/jwt';
import { establecerEmpresaDeLaPeticion } from '../database/tenant-context';
import { empresaRepository } from '../modules/empresa/empresa.repository';
import {
  calcularSuscripcion,
  esEscritura,
  registrarUso,
} from '../modules/suscripcion/suscripcion.service';

/** Rutas que siguen disponibles con la cuenta vencida o suspendida: son justamente las que
 * el usuario necesita para entender qué pasó y para salir. */
const RUTAS_SIEMPRE_PERMITIDAS = ['/auth/', '/suscripcion'];

function esRutaSiemprePermitida(req: Request): boolean {
  return RUTAS_SIEMPRE_PERMITIDAS.some((ruta) => req.path.startsWith(ruta));
}

/**
 * Verifica el token, **fija la empresa de la petición** (lo que activa las políticas RLS de
 * Postgres) y comprueba el estado de la suscripción.
 *
 * La empresa sale del token firmado, nunca de una cabecera, un parámetro o el cuerpo: si
 * viniera del cliente, cualquiera podría pedir los datos de otra empresa cambiando un valor.
 * El servidor decidió a qué empresa pertenece este usuario cuando emitió el token.
 *
 * El control de suscripción vive acá, y no en un middleware que cada router tenga que
 * recordar montar, porque `requireAuth` es el único punto por el que pasan todas las rutas
 * protegidas: una comprobación que hay que acordarse de agregar 30 veces es una que tarde o
 * temprano falta en alguna.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new HttpError(401, 'No autenticado'));
    return;
  }

  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    next(new HttpError(401, 'Token inválido o expirado'));
    return;
  }

  // Un token emitido antes de multi-empresa no trae `empresaId`. Se rechaza en vez de
  // adivinar una empresa: el usuario vuelve a iniciar sesión y obtiene uno completo.
  if (!payload.empresaId) {
    next(new HttpError(401, 'Sesión desactualizada, vuelve a iniciar sesión'));
    return;
  }

  req.usuarioAuth = payload;

  void (async () => {
    try {
      await establecerEmpresaDeLaPeticion(payload.empresaId);

      const empresa = await empresaRepository.findOneBy({ id: payload.empresaId });
      if (!empresa || !empresa.activo) {
        throw new HttpError(403, 'La empresa está inactiva');
      }

      const suscripcion = calcularSuscripcion(empresa);
      req.suscripcion = suscripcion;

      if (!suscripcion.puedeEscribir && !esRutaSiemprePermitida(req)) {
        const contacto = suscripcion.contactoProveedor;
        const comoContactar = [contacto.telefono, contacto.email].filter(Boolean).join(' · ');

        if (suscripcion.estado === 'suspendida') {
          throw new HttpError(
            403,
            `La cuenta está suspendida. Comunícate con ${contacto.nombre}${comoContactar ? ` (${comoContactar})` : ''} para reactivarla.`,
          );
        }

        // Solo se bloquean las escrituras: la demo vencida conserva el acceso de lectura a
        // lo que el restaurante cargó, para que pueda consultarlo y exportarlo mientras
        // decide. Bloquear también la lectura solo lograría que perdiera su trabajo.
        if (esEscritura(req.method)) {
          // 402 (Pago requerido) y no 403: distingue "tu prueba terminó" de "no tienes
          // permiso", que son dos cosas muy distintas para quien lo recibe.
          throw new HttpError(
            402,
            `Tu prueba de ${contacto.nombre} terminó. La información que cargaste sigue disponible para consultar, pero para volver a registrar necesitas activar el sistema${comoContactar ? `: ${comoContactar}` : ''}.`,
          );
        }
      }

      // El registro de uso va después del control de acceso: interesa contar el uso real del
      // sistema, no los intentos rebotados de una cuenta vencida.
      await registrarUso(payload.empresaId, esEscritura(req.method));

      next();
    } catch (error) {
      next(error);
    }
  })();
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
