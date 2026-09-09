import { MigrationInterface, QueryRunner } from 'typeorm';

export class CajaTabla1788962190745 implements MigrationInterface {
  name = 'CajaTabla1788962190745';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."movimientos_caja_tipo_enum" AS ENUM('ingreso', 'egreso')`,
    );
    await queryRunner.query(
      `CREATE TABLE "movimientos_caja" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tipo" "public"."movimientos_caja_tipo_enum" NOT NULL, "monto" numeric(10,2) NOT NULL, "concepto" character varying(255) NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "caja_id" uuid NOT NULL, "usuario_id" uuid NOT NULL, CONSTRAINT "PK_a35825837a156d21e0b922fa627" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cajas_estado_enum" AS ENUM('abierta', 'cerrada')`,
    );
    await queryRunner.query(
      `CREATE TABLE "cajas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "monto_apertura" numeric(10,2) NOT NULL, "observacion_apertura" character varying(255), "monto_esperado" numeric(10,2), "monto_declarado" numeric(10,2), "diferencia" numeric(10,2), "observacion_cierre" character varying(255), "estado" "public"."cajas_estado_enum" NOT NULL DEFAULT 'abierta', "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "fecha_cierre" TIMESTAMP WITH TIME ZONE, "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "usuario_apertura_id" uuid NOT NULL, "usuario_cierre_id" uuid, CONSTRAINT "PK_92b27e5f4ab36a544f37bf45e09" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_una_caja_abierta" ON "cajas"  ("estado") WHERE "estado" = 'abierta'`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_caja" ADD CONSTRAINT "FK_fa3667fcb88a50ddfe4f39aa800" FOREIGN KEY ("caja_id") REFERENCES "cajas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_caja" ADD CONSTRAINT "FK_54e0399df650a63fc8896df47f8" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cajas" ADD CONSTRAINT "FK_94143eee07c4d7307e7c1fec337" FOREIGN KEY ("usuario_apertura_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cajas" ADD CONSTRAINT "FK_13b4161550a2b8a494bfa8aa8d3" FOREIGN KEY ("usuario_cierre_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cajas" DROP CONSTRAINT "FK_13b4161550a2b8a494bfa8aa8d3"`);
    await queryRunner.query(`ALTER TABLE "cajas" DROP CONSTRAINT "FK_94143eee07c4d7307e7c1fec337"`);
    await queryRunner.query(
      `ALTER TABLE "movimientos_caja" DROP CONSTRAINT "FK_54e0399df650a63fc8896df47f8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_caja" DROP CONSTRAINT "FK_fa3667fcb88a50ddfe4f39aa800"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_una_caja_abierta"`);
    await queryRunner.query(`DROP TABLE "cajas"`);
    await queryRunner.query(`DROP TYPE "public"."cajas_estado_enum"`);
    await queryRunner.query(`DROP TABLE "movimientos_caja"`);
    await queryRunner.query(`DROP TYPE "public"."movimientos_caja_tipo_enum"`);
  }
}
