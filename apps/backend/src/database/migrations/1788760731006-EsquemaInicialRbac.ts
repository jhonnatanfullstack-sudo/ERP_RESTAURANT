import { MigrationInterface, QueryRunner } from 'typeorm';

export class EsquemaInicialRbac1788760731006 implements MigrationInterface {
  name = 'EsquemaInicialRbac1788760731006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "permisos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codigo" character varying(100) NOT NULL, "descripcion" character varying(255), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_40d964f2742b2f4e3f379d3f460" UNIQUE ("codigo"), CONSTRAINT "PK_3127bd9cfeb13ae76186d0d9b38" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(50) NOT NULL, "descripcion" character varying(255), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_a5be7aa67e759e347b1c6464e10" UNIQUE ("nombre"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "usuarios" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(150) NOT NULL, "email" character varying(150) NOT NULL, "password_hash" character varying(255) NOT NULL, "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "rol_id" uuid NOT NULL, CONSTRAINT "UQ_446adfc18b35418aac32ae0b7b5" UNIQUE ("email"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_446adfc18b35418aac32ae0b7b" ON "usuarios"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "token_hash" character varying(255) NOT NULL, "expira_en" TIMESTAMP WITH TIME ZONE NOT NULL, "revocado" boolean NOT NULL DEFAULT false, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "usuario_id" uuid NOT NULL, CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens"  ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "roles_permisos" ("rol_id" uuid NOT NULL, "permiso_id" uuid NOT NULL, CONSTRAINT "PK_0e1dbe0449ae37ef1b31b0d9474" PRIMARY KEY ("rol_id", "permiso_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dc3cfbcce511233d4bef92d7e3" ON "roles_permisos"  ("rol_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ef10d9983fcb45f0024cc7000d" ON "roles_permisos"  ("permiso_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "FK_9e519760a660751f4fa21453d3e" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_c8349fdadc1bc791125bdd8c855" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles_permisos" ADD CONSTRAINT "FK_dc3cfbcce511233d4bef92d7e3b" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles_permisos" ADD CONSTRAINT "FK_ef10d9983fcb45f0024cc7000d3" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "roles_permisos" DROP CONSTRAINT "FK_ef10d9983fcb45f0024cc7000d3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles_permisos" DROP CONSTRAINT "FK_dc3cfbcce511233d4bef92d7e3b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_c8349fdadc1bc791125bdd8c855"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "FK_9e519760a660751f4fa21453d3e"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_ef10d9983fcb45f0024cc7000d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dc3cfbcce511233d4bef92d7e3"`);
    await queryRunner.query(`DROP TABLE "roles_permisos"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_446adfc18b35418aac32ae0b7b"`);
    await queryRunner.query(`DROP TABLE "usuarios"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "permisos"`);
  }
}
