import { MigrationInterface, QueryRunner } from 'typeorm';

export class SalonYMesaTablas1788793585582 implements MigrationInterface {
  name = 'SalonYMesaTablas1788793585582';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" DROP CONSTRAINT "FK_producto_unidad_medida"`);
    await queryRunner.query(
      `CREATE TABLE "salones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(100) NOT NULL, "descripcion" character varying(255), "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_22f300f5acac0288304a41c3260" UNIQUE ("nombre"), CONSTRAINT "PK_e97cad8269c0eff03163a422ab2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "mesas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "numero" character varying(20) NOT NULL, "capacidad" smallint NOT NULL, "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "salon_id" uuid NOT NULL, CONSTRAINT "PK_ccff054bd3dad6539869d03350c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d0e007d06459e7aab7e855fec5" ON "mesas"  ("salon_id", "numero") `,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_d9d573eddc1e6de0f2ded4fd888" FOREIGN KEY ("unidad_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "mesas" ADD CONSTRAINT "FK_ba9d8cd5f2b50cfdc1cb552d187" FOREIGN KEY ("salon_id") REFERENCES "salones"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mesas" DROP CONSTRAINT "FK_ba9d8cd5f2b50cfdc1cb552d187"`);
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "FK_d9d573eddc1e6de0f2ded4fd888"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_d0e007d06459e7aab7e855fec5"`);
    await queryRunner.query(`DROP TABLE "mesas"`);
    await queryRunner.query(`DROP TABLE "salones"`);
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_producto_unidad_medida" FOREIGN KEY ("unidad_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}
