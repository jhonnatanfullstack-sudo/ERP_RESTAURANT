import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega "unidad_medida_id" a productos. Se agrega nullable primero,
 * se rellenan los productos ya existentes con la unidad "NIU" (Unidad)
 * como valor por defecto razonable, y recién entonces se vuelve NOT
 * NULL — así no se rompen los productos creados antes de este cambio.
 */
export class ProductoUnidadMedida1788792394428 implements MigrationInterface {
  name = 'ProductoUnidadMedida1788792394428';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" ADD "unidad_medida_id" uuid`);
    await queryRunner.query(
      `UPDATE "productos" SET "unidad_medida_id" = (SELECT "id" FROM "unidades_medida" WHERE "codigo" = 'NIU') WHERE "unidad_medida_id" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "productos" ALTER COLUMN "unidad_medida_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_producto_unidad_medida" FOREIGN KEY ("unidad_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" DROP CONSTRAINT "FK_producto_unidad_medida"`);
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "unidad_medida_id"`);
  }
}
