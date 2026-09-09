import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmpresaRegimenMypeRestaurantes1788973059128 implements MigrationInterface {
  name = 'EmpresaRegimenMypeRestaurantes1788973059128';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "empresas" ADD "acogido_regimen_mype_restaurantes" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "empresas" DROP COLUMN "acogido_regimen_mype_restaurantes"`,
    );
  }
}
