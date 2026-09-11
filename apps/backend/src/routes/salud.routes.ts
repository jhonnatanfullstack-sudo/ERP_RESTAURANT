import { Router } from 'express';
import { AppDataSource } from '../database/data-source';
import { logger } from '../utils/logger';

export const saludRouter = Router();

/** Se activa al recibir SIGTERM: desde ese momento la instancia se declara no disponible
 * aunque siga atendiendo lo que ya tenía en curso. */
let apagando = false;

export function marcarApagado(): void {
  apagando = true;
}

/**
 * **Vida** (`/health`): ¿el proceso responde?
 *
 * No consulta la base a propósito. Si el orquestador reinicia la instancia cada vez que
 * Postgres tiene un hipo, convierte una interrupción de la base en una tormenta de
 * reinicios que la empeora. Un proceso vivo con la base caída no hay que matarlo: hay que
 * dejar de mandarle tráfico, y de eso se encarga `/health/listo`.
 */
saludRouter.get('/health', (_req, res) => {
  res.json({ success: true, message: 'OK', data: { estado: 'vivo' } });
});

/**
 * **Disponibilidad** (`/health/listo`): ¿esta instancia puede atender una petición útil?
 *
 * Sí consulta la base, porque sin ella **ninguna** ruta de la API funciona: con el aislamiento
 * apoyado en RLS, una consulta sin conexión no devuelve datos parciales, no devuelve nada. Un
 * health check que respondiera "OK" sin comprobarlo dejaría al balanceador mandando tráfico a
 * una instancia que solo sabe devolver errores.
 *
 * Es la ruta que hay que configurar como health check en Render/Railway/Fly.
 */
saludRouter.get('/health/listo', (_req, res) => {
  if (apagando) {
    res.status(503).json({ success: false, message: 'El servidor se está apagando', details: [] });
    return;
  }

  void AppDataSource.query('SELECT 1')
    .then(() => {
      res.json({ success: true, message: 'OK', data: { estado: 'listo' } });
    })
    .catch((error: unknown) => {
      logger.error('Health check: la base de datos no responde', error);
      res
        .status(503)
        .json({ success: false, message: 'La base de datos no responde', details: [] });
    });
});
