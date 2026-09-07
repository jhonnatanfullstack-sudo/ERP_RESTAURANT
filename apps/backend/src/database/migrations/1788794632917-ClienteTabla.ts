import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClienteTabla1788794632917 implements MigrationInterface {
  name = 'ClienteTabla1788794632917';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "clientes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombres" character varying(150) NOT NULL, "apellidos" character varying(150), "numero_documento" character varying(20), "telefono" character varying(20), "email" character varying(150), "direccion" character varying(255), "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d76bf3571d906e4e86470482c08" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bcc2e579b8dd6243989d6f2040" ON "clientes"  ("numero_documento") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3cd5652ab34ca1a0a2c7a25531" ON "clientes"  ("email") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_3cd5652ab34ca1a0a2c7a25531"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_bcc2e579b8dd6243989d6f2040"`);
    await queryRunner.query(`DROP TABLE "clientes"`);
  }
}
