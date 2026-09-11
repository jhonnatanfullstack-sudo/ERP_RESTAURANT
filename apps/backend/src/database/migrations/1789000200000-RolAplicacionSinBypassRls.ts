import { MigrationInterface, QueryRunner } from 'typeorm';

/** Rol con el que se conecta la aplicación. Deliberadamente distinto del dueño de las tablas. */
export const ROL_APLICACION = 'restaurant_erp_app';

/**
 * Crea el rol de base de datos con el que se conecta la aplicación, **sin** `SUPERUSER` ni
 * `BYPASSRLS` (FASE 25).
 *
 * Sin esta migración, todo el aislamiento de la migración anterior es decorativo. El rol que
 * crea la imagen oficial de Postgres a partir de `POSTGRES_USER` es superusuario, y un
 * superusuario **se salta las políticas RLS siempre**, incluso con `FORCE ROW LEVEL
 * SECURITY` activado. Se verificó en la base real: conectado con ese rol, una consulta con
 * `app.empresa_id` apuntando a otra empresa seguía devolviendo todas las filas.
 *
 * A partir de acá hay dos roles con responsabilidades separadas:
 *
 * - **El dueño** (`DB_USER`, superusuario): ejecuta las migraciones. Se salta RLS a
 *   propósito — el DDL y los backfills tienen que poder tocar los datos de todas las
 *   empresas.
 * - **La aplicación** (`DB_APP_USER`): atiende las peticiones. Está sujeta a RLS, así que un
 *   filtro olvidado en un service devuelve cero filas en vez de las de otro restaurante.
 *
 * La contraseña sale de `DB_APP_PASSWORD` y nunca se escribe en el código (sección 6 de
 * `CLAUDE.md`). Si falta, la migración falla en vez de inventar una por defecto.
 */
export class RolAplicacionSinBypassRls1789000200000 implements MigrationInterface {
  name = 'RolAplicacionSinBypassRls1789000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const password = process.env.DB_APP_PASSWORD;
    if (!password) {
      throw new Error(
        'Falta DB_APP_PASSWORD en el .env: es la contraseña del rol de base de datos con el ' +
          'que se conecta la aplicación (el que sí está sujeto a RLS). Ver docs/base-de-datos.md.',
      );
    }

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_APLICACION}') THEN
          CREATE ROLE "${ROL_APLICACION}" LOGIN;
        END IF;
      END
      $$;
    `);

    // `format('%L')` cita la contraseña como literal SQL de forma segura: en un `ALTER ROLE`
    // no se pueden usar parámetros ($1), así que se arma la sentencia en la propia base en
    // vez de concatenarla en JavaScript.
    const [{ sentencia }]: Array<{ sentencia: string }> = await queryRunner.query(
      `SELECT format('ALTER ROLE %I WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L', $1::text, $2::text) AS sentencia`,
      [ROL_APLICACION, password],
    );
    await queryRunner.query(sentencia);

    await queryRunner.query(`GRANT USAGE ON SCHEMA "public" TO "${ROL_APLICACION}"`);
    await queryRunner.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "${ROL_APLICACION}"
    `);
    await queryRunner.query(`
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO "${ROL_APLICACION}"
    `);
    // Para que las tablas que creen las migraciones futuras queden accesibles sin tener que
    // acordarse de repetir el GRANT en cada una.
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${ROL_APLICACION}"
    `);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
        GRANT USAGE, SELECT ON SEQUENCES TO "${ROL_APLICACION}"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
        REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM "${ROL_APLICACION}"
    `);
    await queryRunner.query(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE USAGE, SELECT ON SEQUENCES FROM "${ROL_APLICACION}"
    `);
    await queryRunner.query(`
      REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "${ROL_APLICACION}"
    `);
    await queryRunner.query(`
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "${ROL_APLICACION}"
    `);
    await queryRunner.query(`REVOKE USAGE ON SCHEMA "public" FROM "${ROL_APLICACION}"`);
    await queryRunner.query(`DROP ROLE IF EXISTS "${ROL_APLICACION}"`);
  }
}
