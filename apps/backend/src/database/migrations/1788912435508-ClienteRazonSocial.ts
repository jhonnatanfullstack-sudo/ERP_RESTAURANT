import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClienteRazonSocial1788912435508 implements MigrationInterface {
  name = 'ClienteRazonSocial1788912435508';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clientes" ADD "razon_social" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "clientes" ALTER COLUMN "nombres" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clientes" ALTER COLUMN "nombres" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "razon_social"`);
  }
}
