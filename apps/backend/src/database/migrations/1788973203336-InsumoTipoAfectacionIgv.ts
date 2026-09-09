import { MigrationInterface, QueryRunner } from 'typeorm';

export class InsumoTipoAfectacionIgv1788973203336 implements MigrationInterface {
  name = 'InsumoTipoAfectacionIgv1788973203336';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "insumos" ADD "tipo_afectacion_igv_id" uuid NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "insumos" ADD CONSTRAINT "FK_ee093524bfb4534f9d48c5b8aa0" FOREIGN KEY ("tipo_afectacion_igv_id") REFERENCES "tipos_afectacion_igv"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "insumos" DROP CONSTRAINT "FK_ee093524bfb4534f9d48c5b8aa0"`,
    );
    await queryRunner.query(`ALTER TABLE "insumos" DROP COLUMN "tipo_afectacion_igv_id"`);
  }
}
