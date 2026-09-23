import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http-error';
import { verifyAccessToken } from '../utils/jwt';
import { establecerEmpresaDeLaPeticion } from '../database/tenant-context';
import { empresaRepository } from '../modules/empresa/empresa.repository';
import { usuarioRepository } from '../modules/usuarios/usuario.repository';
import {
  calcularSuscripcion,
  esEscritura,
  registrarUso,
} from '../modules/suscripcion/suscripcion.service';

/**
 * Rutas que siguen disponibles con la cuenta vencida o suspendida: son justamente las que el
 * usuario necesita para entender qué pasó y para salir (H01-R05: incluye explícitamente
 * `cambiar-password` — una cuenta obligada a rotar la contraseña tiene que poder hacerlo sin
 * que la suscripción se lo impida).
 *
 * H01-R05 (revisión Codex): esto comparaba contra `req.path`, que **no** significa lo mismo
 * según el nivel de anidamiento en el que corra `requireAuth` — para una ruta puntual como
 * `authRouter.get('/me', requireAuth, ...)` o `authRouter.post('/cambiar-password', ...)`,
 * Express ya recortó los prefijos `/api` y `/auth` antes de llegar acá, así que `req.path` es
 * `/me` o `/cambiar-password`, nunca `/auth/algo` — el `startsWith('/auth/')` de abajo jamás
 * coincidía para esas rutas exactas, y una cuenta suspendida no podía ni cambiar su contraseña
 * ni consultar `/me`. Se cambia a `req.originalUrl`, que es siempre la URL completa desde el
 * principio, sin importar cuántos routers se hayan atravesado.
 */
const RUTAS_SIEMPRE_PERMITIDAS = ['/api/auth/', '/api/suscripcion'];

function esRutaSiemprePermitida(req: Request): boolean {
  const ruta = req.originalUrl.split('?')[0];
  return RUTAS_SIEMPRE_PERMITIDAS.some((prefijo) => ruta.startsWith(prefijo));
}

/**
 * Rutas del propio flujo de cambio de contraseña (H01), alcanzables incluso con
 * `debe_cambiar_password = true`: iniciar sesión ya pasó (esto corre después del login),
 * consultar quién es uno (`/me`), cambiar la contraseña, y poder cerrar sesión sin quedar
 * atrapado si decide no cambiarla ahora.
 *
 * Se compara contra `req.originalUrl` y no `req.path`: `requireAuth` se usa tanto como
 * middleware de router (`router.use(requireAuth)`, donde Express ya recortó el prefijo del
 * montaje) como directamente en una ruta puntual (`authRouter.get('/me', requireAuth, ...)`,
 * donde el recorte es distinto) — `req.originalUrl` es la única propiedad que significa lo
 * mismo sin importar en qué nivel de anidamiento se ejecute este chequeo.
 */
const RUTAS_PERMITIDAS_CON_PASSWORD_PENDIENTE = new Set([
  '/api/auth/cambiar-password',
  '/api/auth/logout',
  '/api/auth/me',
]);

function esRutaPermitidaConPasswordPendiente(req: Request): boolean {
  return RUTAS_PERMITIDAS_CON_PASSWORD_PENDIENTE.has(req.originalUrl.split('?')[0]);
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

      // Se lee de la base en cada petición, igual criterio que `requireProveedor`: si viajara
      // en el JWT, cambiar la contraseña (que la pone en `false`) no surtiría efecto hasta que
      // el token expire, dejando la sesión bloqueada pese a haber cumplido lo que se pedía.
      const usuarioActual = await usuarioRepository.findOne({
        where: { id: payload.sub },
        select: { id: true, debeCambiarPassword: true },
      });
      if (usuarioActual?.debeCambiarPassword && !esRutaPermitidaConPasswordPendiente(req)) {
        // 428 (Precondition Required) y no 401/403: no es que la sesión sea inválida ni que
        // falte permiso — es que hay un paso obligatorio pendiente antes de cualquier otra
        // operación. Un código propio en el body (`codigo`) evita que el frontend tenga que
        // adivinarlo a partir del mensaje.
        throw new HttpError(
          428,
          'Debes cambiar tu contraseña antes de continuar',
          [],
          'DEBE_CAMBIAR_PASSWORD',
        );
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
