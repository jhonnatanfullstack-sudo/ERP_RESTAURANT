import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmpresaPersonalYCatalogosSunat1788761401849 implements MigrationInterface {
  name = 'EmpresaPersonalYCatalogosSunat1788761401849';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "nombre"`);
    await queryRunner.query(
      `CREATE TABLE "empresas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ruc" character varying(11) NOT NULL, "razon_social" character varying(255) NOT NULL, "nombre_comercial" character varying(255), "direccion_fiscal" character varying(255), "telefono" character varying(20), "email" character varying(150), "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_febfecf7816478e76da58585a57" UNIQUE ("ruc"), CONSTRAINT "PK_ce7b122b37c6499bfd6520873e1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tipos_documento_identidad" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codigo" character varying(2) NOT NULL, "nombre" character varying(100) NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_2e37bb3ca645a18bc1435fe400d" UNIQUE ("codigo"), CONSTRAINT "PK_842d51e26471972faad5106f89c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "personal" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "numero_documento" character varying(20) NOT NULL, "nombres" character varying(150) NOT NULL, "apellido_paterno" character varying(100), "apellido_materno" character varying(100), "fecha_nacimiento" date, "telefono" character varying(20), "direccion" character varying(255), "fecha_ingreso" date, "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "empresa_id" uuid NOT NULL, "tipo_documento_identidad_id" uuid NOT NULL, CONSTRAINT "PK_7a849a61cdfe8eee39892d7b1b1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3b72d8245b351e05df50750658" ON "personal"  ("tipo_documento_identidad_id", "numero_documento") `,
    );
    await queryRunner.query(
      `CREATE TABLE "tipos_comprobante" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codigo" character varying(2) NOT NULL, "nombre" character varying(100) NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_171ec93e6ffe7e0bbef6433afbb" UNIQUE ("codigo"), CONSTRAINT "PK_0d8c88f1a45150d7dabae509967" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "usuarios" ADD "personal_id" uuid NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "UQ_dbb625e9e526f9fc6489f290eed" UNIQUE ("personal_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal" ADD CONSTRAINT "FK_fd53d1bce56c60fca9c659bdbfc" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal" ADD CONSTRAINT "FK_91e986475626f7d98abbb187bc8" FOREIGN KEY ("tipo_documento_identidad_id") REFERENCES "tipos_documento_identidad"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD CONSTRAINT "FK_dbb625e9e526f9fc6489f290eed" FOREIGN KEY ("personal_id") REFERENCES "personal"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "FK_dbb625e9e526f9fc6489f290eed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal" DROP CONSTRAINT "FK_91e986475626f7d98abbb187bc8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "personal" DROP CONSTRAINT "FK_fd53d1bce56c60fca9c659bdbfc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP CONSTRAINT "UQ_dbb625e9e526f9fc6489f290eed"`,
    );
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN "personal_id"`);
    await queryRunner.query(`DROP TABLE "tipos_comprobante"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3b72d8245b351e05df50750658"`);
    await queryRunner.query(`DROP TABLE "personal"`);
    await queryRunner.query(`DROP TABLE "tipos_documento_identidad"`);
    await queryRunner.query(`DROP TABLE "empresas"`);
    await queryRunner.query(`ALTER TABLE "usuarios" ADD "nombre" character varying(150) NOT NULL`);
  }
}
