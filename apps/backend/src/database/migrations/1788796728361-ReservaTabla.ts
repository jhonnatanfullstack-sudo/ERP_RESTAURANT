import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservaTabla1788796728361 implements MigrationInterface {
  name = 'ReservaTabla1788796728361';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."reservas_estado_enum" AS ENUM('pendiente', 'confirmada', 'cancelada', 'completada')`,
    );
    await queryRunner.query(
      `CREATE TABLE "reservas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fecha_hora" TIMESTAMP WITH TIME ZONE NOT NULL, "duracion_minutos" smallint NOT NULL DEFAULT '90', "cantidad_personas" smallint NOT NULL, "estado" "public"."reservas_estado_enum" NOT NULL DEFAULT 'pendiente', "notas" character varying(255), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cliente_id" uuid NOT NULL, "mesa_id" uuid NOT NULL, CONSTRAINT "PK_309c659053bcf5e56f8e40a2b42" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservas" ADD CONSTRAINT "FK_f5a0559320f5dec880533a41d2e" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservas" ADD CONSTRAINT "FK_d4d544979009adb460c6c97c52e" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reservas" DROP CONSTRAINT "FK_d4d544979009adb460c6c97c52e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservas" DROP CONSTRAINT "FK_f5a0559320f5dec880533a41d2e"`,
    );
    await queryRunner.query(`DROP TABLE "reservas"`);
    await queryRunner.query(`DROP TYPE "public"."reservas_estado_enum"`);
  }
}
