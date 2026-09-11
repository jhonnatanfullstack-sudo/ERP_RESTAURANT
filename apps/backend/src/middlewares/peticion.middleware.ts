import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger';
import type { NextFunction, Request, Response } from 'express';

/** Cabecera estándar de trazas entre servicios. Si el balanceador ya puso una, se respeta:
 * así el identificador es el mismo en los registros del proxy y en los de la aplicación. */
const CABECERA_TRAZA = 'x-request-id';

/** A partir de cuántos milisegundos una petición se registra como lenta. */
const UMBRAL_LENTITUD_MS = 1500;

/**
 * Asigna un identificador a cada petición y registra cómo terminó.
 *
 * Sin esto, un error en producción es una línea suelta sin forma de saber a qué petición
 * pertenecía, de qué empresa venía ni cuánto tardó. Con el identificador, el registro del
 * error y el de la petición se cruzan, y quien reporta un problema puede dar ese código en
 * vez de "me falló hace un rato".
 *
 * El identificador viaja de vuelta en la respuesta (`x-request-id`) justamente para eso.
 */
export function peticionMiddleware(req: Request, res: Response, next: NextFunction): void {
  const trazaEntrante = req.headers[CABECERA_TRAZA];
  req.idTraza = (typeof trazaEntrante === 'string' && trazaEntrante) || randomUUID();
  res.setHeader(CABECERA_TRAZA, req.idTraza);

  const inicio = process.hrtime.bigint();

  res.on('finish', () => {
    const duracionMs = Number(process.hrtime.bigint() - inicio) / 1_000_000;
    const contexto = {
      idTraza: req.idTraza,
      metodo: req.method,
      ruta: req.originalUrl.split('?')[0],
      estado: res.statusCode,
      ms: Math.round(duracionMs),
      // La empresa convierte un registro anónimo en uno accionable: permite reconstruir qué
      // pasó con un cliente concreto sin cruzar tablas a mano.
      empresaId: req.usuarioAuth?.empresaId,
    };

    if (res.statusCode >= 500) {
      logger.error('Petición fallida', undefined, contexto);
    } else if (res.statusCode >= 400) {
      logger.warn('Petición rechazada', contexto);
    } else if (duracionMs >= UMBRAL_LENTITUD_MS) {
      // Una petición lenta no es un error, pero es lo que anticipa una caída: conviene que
      // quede anotada antes de que alguien se queje.
      logger.warn('Petición lenta', contexto);
    } else {
      logger.debug('Petición', contexto);
    }
  });

  next();
}
