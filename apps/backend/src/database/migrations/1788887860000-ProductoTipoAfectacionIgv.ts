import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega "tipo_afectacion_igv_id" a productos, necesario para que Ventas sepa si una
 * línea lleva IGV o no. Se agrega nullable primero, se rellenan los productos ya
 * existentes con "10 - Gravado - Operación Onerosa" (el caso normal de un restaurante:
 * el servicio de alimentos/bebidas está afecto a IGV), y recién entonces se vuelve NOT
 * NULL — mismo patrón que ProductoUnidadMedida, para no romper productos ya creados.
 */
export class ProductoTipoAfectacionIgv1788887860000 implements MigrationInterface {
  name = 'ProductoTipoAfectacionIgv1788887860000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" ADD "tipo_afectacion_igv_id" uuid`);
    await queryRunner.query(
      `UPDATE "productos" SET "tipo_afectacion_igv_id" = (SELECT "id" FROM "tipos_afectacion_igv" WHERE "codigo" = '10') WHERE "tipo_afectacion_igv_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ALTER COLUMN "tipo_afectacion_igv_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_producto_tipo_afectacion_igv" FOREIGN KEY ("tipo_afectacion_igv_id") REFERENCES "tipos_afectacion_igv"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "FK_producto_tipo_afectacion_igv"`,
    );
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "tipo_afectacion_igv_id"`);
  }
}
