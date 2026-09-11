import { MigrationInterface, QueryRunner } from 'typeorm';
import { activarBypassRls } from '../bypass-rls';

/**
 * Corrige las bases donde `UsuarioProveedor` dejó la columna `es_proveedor` en `false` para
 * todos los usuarios.
 *
 * Causa: esa migración decidía en JavaScript si hacía falta el respaldo, leyendo el resultado
 * de un `UPDATE ... RETURNING`. El driver de Postgres devuelve ahí `[filas, cantidad]`, de
 * modo que la desestructuración entregaba el arreglo de filas — vacío, pero **truthy** — y el
 * respaldo nunca se ejecutaba. Sin ningún usuario marcado, el panel del proveedor quedaba
 * inaccesible (respondía 404 incluso al dueño del sistema).
 *
 * La migración original ya quedó corregida para instalaciones nuevas; esta arregla las que
 * ya la habían ejecutado. Es idempotente: si ya hay un proveedor marcado, no toca nada.
 */
export class CorregirMarcaProveedor1789000500000 implements MigrationInterface {
  name = 'CorregirMarcaProveedor1789000500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Escribe en `usuarios`, que está bajo RLS: sin el bypass, en un Postgres gestionado
    // (donde el rol de migraciones no es superusuario) esta migración afectaría cero filas
    // y dejaría el sistema sin ningún proveedor marcado.
    await activarBypassRls(queryRunner);

    await queryRunner.query(
      `UPDATE "usuarios" SET "es_proveedor" = true
        WHERE NOT EXISTS (SELECT 1 FROM "usuarios" WHERE "es_proveedor")
          AND "id" = COALESCE(
            (SELECT "id" FROM "usuarios" WHERE "email" = $1),
            (SELECT "id" FROM "usuarios" ORDER BY "creado_en" ASC LIMIT 1)
          )`,
      [process.env.PROVEEDOR_EMAIL ?? null],
    );
  }

  public async down(): Promise<void> {
    // Nada que revertir: dejar el sistema sin ningún proveedor marcado es justamente el
    // estado roto que esta migración existe para arreglar.
  }
}
