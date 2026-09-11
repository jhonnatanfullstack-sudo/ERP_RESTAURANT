import { afterAll, beforeAll } from 'vitest';
import { AppDataSource } from '../src/database/data-source';

/**
 * Abre y cierra la conexión de la aplicación alrededor de cada archivo de pruebas.
 *
 * `AppDataSource` usa el rol restringido (`DB_APP_USER`), el mismo que en producción: sin
 * `SUPERUSER` ni `BYPASSRLS`. Si las pruebas se conectaran con el rol dueño, las de
 * aislamiento pasarían siempre —incluso con las políticas rotas— porque un superusuario lo
 * ve todo. Conectarse como la aplicación real es lo que les da sentido.
 */
beforeAll(async () => {
  if (AppDataSource.isInitialized) return;

  // `initialize()` carga las clases de migración con `require`, y este proceso no sabe
  // interpretar TypeScript: al primer `public async up(...)` revienta. En las pruebas no
  // hacen falta —`global-setup.ts` ya las aplicó con el comando real— así que se vacía la
  // lista antes de conectar. La conexión de la aplicación en sí queda idéntica.
  AppDataSource.setOptions({ migrations: [] });
  await AppDataSource.initialize();
});

afterAll(async () => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
