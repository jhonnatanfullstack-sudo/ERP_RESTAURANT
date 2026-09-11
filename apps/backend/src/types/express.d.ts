import type { AccessTokenPayload } from '../utils/jwt';
import type { ResumenSuscripcion } from '../modules/suscripcion/suscripcion.service';

declare global {
  namespace Express {
    interface Request {
      usuarioAuth?: AccessTokenPayload;
      /** Estado de la suscripción de la empresa de la petición, resuelto por `requireAuth`. */
      suscripcion?: ResumenSuscripcion;
      /** Identificador de esta petición, para cruzar sus registros. Viaja de vuelta en la
       * cabecera `x-request-id`. Lo asigna `peticion.middleware.ts`. */
      idTraza?: string;
    }
  }
}

export {};
