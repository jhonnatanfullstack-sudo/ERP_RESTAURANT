import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

// Las variables se cargan acá directamente y no importando `config/env.ts`: este archivo lo
// ejecuta el proceso principal de Vitest, fuera de la canalización que transforma el resto
// del código, así que cualquier import de `src/` (con decoradores y sintaxis TypeScript)
// revienta al cargarse. Sin esto, `DB_PASSWORD` llega vacío y la conexión falla.
config({ path: resolve(__dirname, '../../../.env') });

export const BASE_DE_PRUEBAS = 'restaurant_erp_test';

/**
 * Prepara la base de pruebas **una vez** por ejecución completa: la recrea desde cero y le
 * aplica todas las migraciones.
 *
 * Recrearla en vez de limpiar tablas es a propósito: las migraciones son parte de lo que hay
 * que probar. Un `CHECK`, un índice único o una política RLS que solo existieran en la base
 * de desarrollo —porque alguien los creó a mano en su momento— pasarían desapercibidos para
 * siempre. Acá cada ejecución parte del mismo esquema que tendría una instalación nueva.
 *
 * Las migraciones se ejecutan con **el mismo comando que en producción**
 * (`pnpm migration:run`, que usa `migration-data-source.ts` y el rol dueño) y en un
 * subproceso. No es un rodeo: TypeORM carga los archivos de migración con `require`, y este
 * proceso no sabe interpretar TypeScript, así que `runMigrations()` desde aquí falla al
 * primer `public async up(...)`. Delegar en el comando real resuelve eso y, de paso, hace que
 * cada ejecución de las pruebas verifique que ese comando sigue funcionando.
 */
export default async function setup(): Promise<void> {
  const cliente = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // El DDL de crear/borrar una base no se puede ejecutar desde dentro de esa misma base.
    database: 'postgres',
  });
  await cliente.connect();

  // `DROP DATABASE` falla si alguien la está usando: por ejemplo una ejecución anterior
  // que se interrumpió a la mitad.
  await cliente.query(
    `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [BASE_DE_PRUEBAS],
  );
  await cliente.query(`DROP DATABASE IF EXISTS "${BASE_DE_PRUEBAS}"`);
  await cliente.query(`CREATE DATABASE "${BASE_DE_PRUEBAS}"`);
  await cliente.end();

  execFileSync('pnpm', ['run', 'migration:run'], {
    cwd: resolve(__dirname, '..'),
    // Solo se pisa el nombre de la base: el resto de la configuración (rol dueño incluido)
    // sale del `.env`, igual que en un despliegue real.
    env: { ...process.env, DB_NAME: BASE_DE_PRUEBAS },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}
