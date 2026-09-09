import { MigrationInterface, QueryRunner } from 'typeorm';

export class VentaTipoCambio1788912598514 implements MigrationInterface {
  name = 'VentaTipoCambio1788912598514';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ventas" ADD "tipo_cambio" numeric(10,3)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "tipo_cambio"`);
  }
}
