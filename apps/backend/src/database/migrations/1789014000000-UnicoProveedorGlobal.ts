import { MigrationInterface, QueryRunner } from 'typeorm';
import { activarBypassRls } from '../bypass-rls';

/**
 * H01-R04 (revisión Codex) — la garantía de "como máximo un proveedor a la vez" vivía solo en
 * `proveedor-bootstrap.service.ts` (advisory lock + conteo dentro de la misma transacción).
 * Eso protege las llamadas que pasan por ese servicio, pero no es un invariante de la base:
 * un `UPDATE` directo, un bug futuro, o cualquier código que no pase por el servicio podría
 * dejar dos filas con `es_proveedor = true` sin que nada lo impida.
 *
 * Esta migración mueve la garantía principal a Postgres, con el mismo patrón ya usado en este
 * proyecto para "una sola caja abierta" (`IDX_una_caja_abierta_por_empresa`) y "un solo
 * almacén principal" — un índice único parcial — pero SIN la columna de empresa: acá el
 * invariante es global, no por restaurante (el proveedor de la plataforma no es de ninguna
 * empresa en particular).
 *
 * Por qué un índice único (no una columna calculada ni un `CHECK`): un `UNIQUE INDEX ...
 * WHERE es_proveedor = true` incluye en el índice únicamente las filas que cumplen la
 * condición: como todas esas filas comparten el mismo valor (`true`) en la columna indexada,
 * Postgres nunca permite que haya más de una. Es una garantía a nivel de storage, verificada
 * en cada `INSERT`/`UPDATE` sin importar qué código la dispare.
 *
 * Compatible con RLS sin ninguna adaptación: un índice único opera sobre las filas físicas de
 * la tabla, no sobre lo que una sesión puede *ver* — RLS filtra visibilidad por
 * `empresa_id`, pero la restricción de unicidad se evalúa igual sin importar si la fila
 * conflictiva pertenece a una empresa distinta de la que fijó `app.empresa_id`. No hace falta
 * bypass para que la restricción exista ni para que se cumpla (sí para la comprobación previa
 * de esta misma migración, que lee todas las filas sin que ninguna empresa esté fijada).
 *
 * Antes de crear el índice, se verifica que la base actual ya cumpla el invariante. Si
 * encuentra más de un proveedor, la migración **falla** (no elige cuál conservar): dejar que
 * Postgres rechace la migración es preferible a que el código decida por sí solo a quién
 * quitarle un privilegio administrativo.
 */
export class UnicoProveedorGlobal1789014000000 implements MigrationInterface {
  name = 'UnicoProveedorGlobal1789014000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Solo para la LECTURA de verificación: sin empresa fijada, RLS no deja ver ninguna fila,
    // y "cuento cero proveedores" sería una mentira, no una comprobación.
    await activarBypassRls(queryRunner);

    const [{ total }]: [{ total: number }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM "usuarios" WHERE "es_proveedor" = true`,
    );

    if (total > 1) {
      const proveedores: Array<{ email: string }> = await queryRunner.query(
        `SELECT "email" FROM "usuarios" WHERE "es_proveedor" = true ORDER BY "email"`,
      );
      throw new Error(
        `Hay ${total} usuarios marcados como proveedor a la vez (${proveedores.map((p) => p.email).join(', ')}); ` +
          'el sistema solo admite uno. Esta migración no elige automáticamente cuál conservar ' +
          '— resuélvelo a mano antes de continuar: "pnpm proveedor:listar" para verlos y ' +
          '"pnpm proveedor:quitar --email <correo>" para dejar solo el que corresponda.',
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_un_proveedor_global" ON "usuarios" ("es_proveedor") WHERE "es_proveedor" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_un_proveedor_global"`);
  }
}
