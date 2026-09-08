import { MigrationInterface, QueryRunner } from 'typeorm';

export class CatalogosVentas1788887840494 implements MigrationInterface {
  name = 'CatalogosVentas1788887840494';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tipos_afectacion_igv" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codigo" character varying(2) NOT NULL, "nombre" character varying(100) NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_df453a26a4bc323498bd1096ca5" UNIQUE ("codigo"), CONSTRAINT "PK_96b705b845bc4608ea40f1e6cbc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tipos_operacion" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codigo" character varying(4) NOT NULL, "nombre" character varying(100) NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_4dd8f077ae3ef9a83211a0a41e0" UNIQUE ("codigo"), CONSTRAINT "PK_56ffbb72b2827a2d2410d5f5e3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "medios_pago" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "codigo" character varying(30) NOT NULL, "nombre" character varying(100) NOT NULL, "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_8f4802fcdfc719a8d692d70b4a9" UNIQUE ("codigo"), CONSTRAINT "PK_dffd2def00c29d0d196ffa95204" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "medios_pago"`);
    await queryRunner.query(`DROP TABLE "tipos_operacion"`);
    await queryRunner.query(`DROP TABLE "tipos_afectacion_igv"`);
  }
}
