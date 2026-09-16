import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nuevo valor del enum `existencias_tipo_enum`: `anulacion_venta` — la reversa de un
 * `venta_directa` cuando se anula la venta que lo generó (ver `existencia.service.ts:
 * anularSalidasVenta` y `venta.service.ts: anularVenta`). Antes de esta migración, anular una
 * venta no devolvía nada al stock: cada venta anulada descuadraba el inventario en silencio.
 *
 * `ALTER TYPE ... ADD VALUE` no puede usarse dentro de la misma transacción en la que el
 * valor nuevo se lee/escribe, pero sí puede ejecutarse dentro de una transacción que solo
 * altera el tipo (Postgres 12+) — mismo patrón ya usado para agregar `anulacion_compra` en
 * `ProveedoresComprasTablas1788974665887`.
 */
export class AnulacionVentaExistencias1789012000000 implements MigrationInterface {
  name = 'AnulacionVentaExistencias1789012000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."existencias_tipo_enum" ADD VALUE 'anulacion_venta'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres no soporta quitar un valor de un enum directamente: hay que recrear el tipo
    // sin él. Mismo patrón que ya usa el `down` de `ProveedoresComprasTablas` para el enum
    // equivalente — se reconstruye la columna contra un tipo nuevo sin 'anulacion_venta'.
    await queryRunner.query(
      `CREATE TYPE "public"."existencias_tipo_enum_old" AS ENUM('inicial', 'compra', 'ajuste_entrada', 'ajuste_salida', 'consumo_cocina', 'venta_directa', 'anulacion_compra')`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" ALTER COLUMN "tipo" TYPE "public"."existencias_tipo_enum_old" USING "tipo"::text::"public"."existencias_tipo_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."existencias_tipo_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."existencias_tipo_enum_old" RENAME TO "existencias_tipo_enum"`,
    );
  }
}
