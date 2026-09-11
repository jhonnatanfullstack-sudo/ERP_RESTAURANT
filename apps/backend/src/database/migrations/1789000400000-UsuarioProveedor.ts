import { MigrationInterface, QueryRunner } from 'typeorm';
import { activarBypassRls } from '../bypass-rls';

/**
 * Marca del proveedor del sistema en `usuarios` (FASE 26).
 *
 * El proveedor es quien vende y opera el sistema, no un usuario de ningún restaurante. Su
 * panel (`/api/proveedor`) es el único lugar que consulta todas las empresas a la vez, con
 * el bypass explícito de RLS.
 *
 * La marca se pone acá y **nunca por la API**: si fuera un campo editable desde la gestión
 * de usuarios, el administrador de cualquier restaurante podría ascenderse y leer los datos
 * de todos los demás.
 *
 * A quién marcar: al usuario cuyo correo coincida con `PROVEEDOR_EMAIL`. Si no existe
 * ninguno (lo normal en una instalación recién migrada, donde el único usuario es el admin
 * de arranque), se marca al usuario más antiguo, que es precisamente esa cuenta de arranque.
 */
export class UsuarioProveedor1789000400000 implements MigrationInterface {
  name = 'UsuarioProveedor1789000400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Escribe en `usuarios`, que está bajo RLS: sin el bypass, en un Postgres gestionado
    // (donde el rol de migraciones no es superusuario) esta migración afectaría cero filas
    // y dejaría el sistema sin ningún proveedor marcado.
    await activarBypassRls(queryRunner);

    await queryRunner.query(`
      ALTER TABLE "usuarios" ADD COLUMN "es_proveedor" boolean NOT NULL DEFAULT false
    `);

    // Una sola sentencia con COALESCE en vez de "intentar por correo y si no, el más
    // antiguo": el driver de Postgres devuelve `[filas, cantidad]` en un UPDATE con
    // RETURNING, así que comprobar el resultado en JavaScript para decidir si hace falta el
    // respaldo es un error fácil de cometer (y se cometió: el arreglo vacío es truthy).
    await queryRunner.query(
      `UPDATE "usuarios" SET "es_proveedor" = true
        WHERE "id" = COALESCE(
          (SELECT "id" FROM "usuarios" WHERE "email" = $1),
          (SELECT "id" FROM "usuarios" ORDER BY "creado_en" ASC LIMIT 1)
        )`,
      [process.env.PROVEEDOR_EMAIL ?? null],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "es_proveedor"`);
  }
}
