import { MigrationInterface, QueryRunner } from 'typeorm';

export class CamposEmpresa1788911235405 implements MigrationInterface {
  name = 'CamposEmpresa1788911235405';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "empresas" ADD "ubigeo" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "empresas" ADD "logo" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "empresas" DROP COLUMN "logo"`);
    await queryRunner.query(`ALTER TABLE "empresas" DROP COLUMN "ubigeo"`);
  }
}
