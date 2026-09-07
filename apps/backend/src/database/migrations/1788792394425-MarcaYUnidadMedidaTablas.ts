import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarcaYUnidadMedidaTablas1788792394425 implements MigrationInterface {
  name = 'MarcaYUnidadMedidaTablas1788792394425';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "unidades_medida" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codigo" character varying(4) NOT NULL, "nombre" character varying(100) NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_d97cb04b559197c7009e0f8903c" UNIQUE ("codigo"), CONSTRAINT "PK_b299f0e6758c0c02ae3e729232a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "marcas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(100) NOT NULL, "descripcion" character varying(255), "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_29f5713899c32a96a8900143c6f" UNIQUE ("nombre"), CONSTRAINT "PK_0dabf9ed9a15bfb634cb675f7d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "productos" ADD "marca_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_db0c18bdd5f379d40ae838e74bd" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "FK_db0c18bdd5f379d40ae838e74bd"`,
    );
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "marca_id"`);
    await queryRunner.query(`DROP TABLE "marcas"`);
    await queryRunner.query(`DROP TABLE "unidades_medida"`);
  }
}
