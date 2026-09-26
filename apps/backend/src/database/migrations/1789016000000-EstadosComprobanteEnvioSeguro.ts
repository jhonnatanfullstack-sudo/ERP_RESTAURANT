import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * H13 — dos valores nuevos en `comprobantes_electronicos_estado_enum`: `enviando` y
 * `resultado_incierto` (ver `comprobante-electronico.entity.ts: EstadoComprobante` para el
 * significado completo de cada uno dentro del flujo PREPARAR → COMMIT ANTICIPADO → OSE →
 * FINALIZAR, `facturacion.service.ts`).
 *
 * Solo se toca `comprobantes_electronicos_estado_enum`: aunque `guias_remision` y
 * `notas_venta` comparten el mismo enum de TypeScript (`EstadoComprobante`), cada una tiene su
 * propio tipo de columna en Postgres (`guias_remision_estado_enum`, `notas_venta_estado_enum`,
 * ver sus migraciones respectivas) y ninguno de esos dos módulos recibió el rediseño H13 —
 * siguen sin producir ni consumir estos dos valores nuevos.
 *
 * `up()` únicamente EXTIENDE el enum — no actualiza ninguna fila existente ni usa los valores
 * nuevos dentro de esta misma migración (mismo patrón ya usado para `anulacion_venta` en
 * `AnulacionVentaExistencias1789012000000`: `ALTER TYPE ... ADD VALUE` corre en su propia
 * transacción, sin leer/escribir ese valor en el mismo lote).
 */
export class EstadosComprobanteEnvioSeguro1789016000000 implements MigrationInterface {
  name = 'EstadosComprobanteEnvioSeguro1789016000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."comprobantes_electronicos_estado_enum" ADD VALUE 'enviando'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."comprobantes_electronicos_estado_enum" ADD VALUE 'resultado_incierto'`,
    );
  }

  /**
   * Postgres no soporta quitar un valor de un enum directamente: hay que recrear el tipo sin
   * él (mismo patrón que el `down` de `AnulacionVentaExistencias1789012000000` para
   * `existencias_tipo_enum`).
   *
   * A diferencia de ese precedente, acá se verifica ANTES de tocar el tipo si alguna fila real
   * quedó en `enviando` o `resultado_incierto`: revertir esta migración con filas en esos
   * estados significaría, para `enviando`, borrar la única marca durable de que un envío al
   * OSE puede haber ocurrido (exactamente lo que H13 existe para evitar), y para
   * `resultado_incierto`, descartar un comprobante que sigue pendiente de reconciliación
   * manual contra el OSE. Ninguno de los dos casos tiene una conversión segura a un estado
   * anterior — así que se aborta con un mensaje explícito en vez de dejar que Postgres falle
   * con un error de cast genérico (o, peor, que alguien "resuelva" el bloqueo forzando esas
   * filas a `error_envio` antes de reintentar el `down`).
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const filasEnUso: Array<{ estado: string; total: string }> = await queryRunner.query(`
      SELECT "estado"::text AS "estado", count(*) AS "total"
      FROM "comprobantes_electronicos"
      WHERE "estado" IN ('enviando', 'resultado_incierto')
      GROUP BY "estado"
    `);
    if (filasEnUso.length > 0) {
      const detalle = filasEnUso.map((f) => `${f.estado}: ${f.total}`).join(', ');
      throw new Error(
        `No se puede revertir EstadosComprobanteEnvioSeguro1789016000000: hay comprobantes ` +
          `electrónicos en estados que dejarían de existir (${detalle}). Cada uno requiere ` +
          `reconciliación manual contra el OSE antes de poder quitar estos valores del enum — ` +
          `nunca se convierten automáticamente a otro estado.`,
      );
    }

    await queryRunner.query(
      `CREATE TYPE "public"."comprobantes_electronicos_estado_enum_old" AS ENUM('pendiente', 'aceptado', 'observado', 'rechazado', 'error_envio')`,
    );
    await queryRunner.query(
      `ALTER TABLE "comprobantes_electronicos" ALTER COLUMN "estado" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "comprobantes_electronicos" ALTER COLUMN "estado" TYPE "public"."comprobantes_electronicos_estado_enum_old" USING "estado"::text::"public"."comprobantes_electronicos_estado_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."comprobantes_electronicos_estado_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."comprobantes_electronicos_estado_enum_old" RENAME TO "comprobantes_electronicos_estado_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comprobantes_electronicos" ALTER COLUMN "estado" SET DEFAULT 'pendiente'`,
    );
  }
}
