import 'reflect-metadata';
import { AppDataSource } from './database/data-source';
import { app } from './app';
import { env } from './config/env';
import { verificarEntorno } from './config/verificar-entorno';
import { marcarApagado } from './routes/salud.routes';
import { initSocket } from './realtime/socket';
import { logger } from './utils/logger';
import type { Server } from 'node:http';

/** Cuánto se espera a que terminen las peticiones en curso antes de cortar por lo sano.
 * Los PaaS suelen conceder unos 30 s entre el SIGTERM y el SIGKILL. */
const MS_ESPERA_APAGADO = 15_000;

/**
 * Apagado ordenado.
 *
 * Cada despliegue en cualquier PaaS envía `SIGTERM` al proceso anterior. Sin esto, el proceso
 * muere de inmediato: las peticiones en vuelo se cortan a medio camino y —lo que más importa
 * acá— sus transacciones quedan abiertas hasta que Postgres las descarta por su cuenta. Con
 * una transacción por petición (ver `tenant.middleware.ts`), eso significa una venta a medio
 * grabar en el peor momento posible.
 *
 * El orden es el que importa: primero se deja de aceptar conexiones nuevas, después se espera
 * a que las que ya estaban terminen y recién entonces se cierra el pool.
 */
function configurarApagado(server: Server): void {
  let apagando = false;

  const apagar = (senal: string) => {
    if (apagando) return;
    apagando = true;
    logger.info('Apagando el servidor', { senal });

    // El health check empieza a responder 503 antes de cerrar nada: así el balanceador deja
    // de mandar tráfico a esta instancia mientras todavía puede atender lo que tiene.
    marcarApagado();

    const corteForzado = setTimeout(() => {
      logger.warn('Peticiones en curso demasiado lentas: se corta igual');
      process.exit(1);
    }, MS_ESPERA_APAGADO);
    // El temporizador no debe mantener vivo el proceso si todo termina antes.
    corteForzado.unref();

    server.close((error) => {
      // `ERR_SERVER_NOT_RUNNING` significa que ya había dejado de escuchar: el objetivo está
      // cumplido, no es un fallo. Tratarlo como error hacía que el proceso saliera con
      // código 1 en cada apagado, y un contenedor que siempre "falla" al detenerse ensucia
      // los registros del orquestador y puede disparar alertas falsas.
      const fallo =
        error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? error : null;
      if (fallo) logger.error('Error al cerrar el servidor HTTP', fallo);

      void AppDataSource.destroy()
        .then(() => logger.info('Conexiones de base de datos cerradas'))
        .catch((error: unknown) => logger.error('Error al cerrar la base de datos', error))
        .finally(() => {
          logger.info('Apagado completo');
          process.exit(fallo ? 1 : 0);
        });
    });
  };

  process.on('SIGTERM', () => apagar('SIGTERM'));
  process.on('SIGINT', () => apagar('SIGINT'));
}

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  logger.info('Conexión a la base de datos establecida');

  // Antes de escuchar: si la configuración está mal en producción, es preferible no llegar
  // nunca a aceptar tráfico.
  await verificarEntorno();

  const server = app.listen(env.port, () => {
    logger.info('Servidor escuchando', { puerto: env.port, entorno: env.nodeEnv });
  });
  initSocket(server);

  configurarApagado(server);
}

bootstrap().catch((error: unknown) => {
  logger.error('Error al iniciar el servidor', error);
  process.exit(1);
});
