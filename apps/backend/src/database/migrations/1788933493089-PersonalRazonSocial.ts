import { MigrationInterface, QueryRunner } from 'typeorm';

export class PersonalRazonSocial1788933493089 implements MigrationInterface {
  name = 'PersonalRazonSocial1788933493089';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "personal" ADD "razon_social" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "personal" ALTER COLUMN "nombres" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Una persona jurídica no tiene nombres: para poder volver a NOT NULL se
    // reubica su razón social en la columna de nombres antes de borrarla.
    await queryRunner.query(
      `UPDATE "personal" SET "nombres" = "razon_social" WHERE "nombres" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "personal" ALTER COLUMN "nombres" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "personal" DROP COLUMN "razon_social"`);
  }
}
