import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { AppDataSource } from './data-source';

/**
 * Conexión que usa el CLI de TypeORM para ejecutar migraciones.
 *
 * Es la misma configuración que la de la aplicación salvo por las credenciales: aquí se
 * conecta el **dueño** de las tablas (`DB_USER`), que al ser superusuario se salta las
 * políticas RLS. Eso es exactamente lo que una migración necesita — el DDL y los backfills
 * tienen que poder tocar los datos de todas las empresas — y exactamente lo que la
 * aplicación no debe poder hacer nunca, por eso son dos roles distintos.
 *
 * Los scripts `migration:*` de `package.json` apuntan a este archivo, no a `data-source.ts`.
 */
export const MigrationDataSource = new DataSource({
  ...AppDataSource.options,
  username: env.db.user,
  password: env.db.password,
} as typeof AppDataSource.options);
