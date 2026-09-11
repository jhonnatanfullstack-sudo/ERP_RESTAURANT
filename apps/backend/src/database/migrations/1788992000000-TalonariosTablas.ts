import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Talonarios (series de comprobantes) y su asignación a usuarios, más el enlace desde
 * `ventas`: cada comprobante emitido queda apuntando al talonario del que salió su número.
 *
 * `ventas.talonario_id` es nullable a propósito: las ventas anteriores a este módulo se
 * numeraron con la serie fija por tipo de comprobante y no pertenecen a ningún talonario.
 */
export class TalonariosTablas1788992000000 implements MigrationInterface {
  name = 'TalonariosTablas1788992000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "talonarios" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "serie" character varying(4) NOT NULL,
        "numero_actual" integer NOT NULL DEFAULT 0,
        "numero_inicio" integer NOT NULL DEFAULT 1,
        "numero_fin" integer NOT NULL DEFAULT 99999999,
        "activo" boolean NOT NULL DEFAULT true,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "empresa_id" uuid NOT NULL,
        "tipo_comprobante_id" uuid NOT NULL,
        "almacen_id" uuid NOT NULL,
        CONSTRAINT "CHK_talonario_rango" CHECK ("numero_inicio" >= 1 AND "numero_fin" >= "numero_inicio"),
        CONSTRAINT "CHK_talonario_numero_actual" CHECK ("numero_actual" >= 0),
        CONSTRAINT "PK_talonarios" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_un_talonario_por_empresa_serie" ON "talonarios" ("empresa_id", "serie")`,
    );

    await queryRunner.query(
      `CREATE TABLE "talonario_usuarios" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "talonario_id" uuid NOT NULL,
        "usuario_id" uuid NOT NULL,
        CONSTRAINT "PK_talonario_usuarios" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_un_talonario_por_usuario" ON "talonario_usuarios" ("talonario_id", "usuario_id")`,
    );

    await queryRunner.query(`ALTER TABLE "ventas" ADD "talonario_id" uuid`);

    await queryRunner.query(
      `ALTER TABLE "talonarios" ADD CONSTRAINT "FK_talonarios_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "talonarios" ADD CONSTRAINT "FK_talonarios_tipo_comprobante" FOREIGN KEY ("tipo_comprobante_id") REFERENCES "tipos_comprobante"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "talonarios" ADD CONSTRAINT "FK_talonarios_almacen" FOREIGN KEY ("almacen_id") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "talonario_usuarios" ADD CONSTRAINT "FK_talonario_usuarios_talonario" FOREIGN KEY ("talonario_id") REFERENCES "talonarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "talonario_usuarios" ADD CONSTRAINT "FK_talonario_usuarios_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_ventas_talonario" FOREIGN KEY ("talonario_id") REFERENCES "talonarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "FK_ventas_talonario"`);
    await queryRunner.query(
      `ALTER TABLE "talonario_usuarios" DROP CONSTRAINT "FK_talonario_usuarios_usuario"`,
    );
    await queryRunner.query(
      `ALTER TABLE "talonario_usuarios" DROP CONSTRAINT "FK_talonario_usuarios_talonario"`,
    );
    await queryRunner.query(`ALTER TABLE "talonarios" DROP CONSTRAINT "FK_talonarios_almacen"`);
    await queryRunner.query(
      `ALTER TABLE "talonarios" DROP CONSTRAINT "FK_talonarios_tipo_comprobante"`,
    );
    await queryRunner.query(`ALTER TABLE "talonarios" DROP CONSTRAINT "FK_talonarios_empresa"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "talonario_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_un_talonario_por_usuario"`);
    await queryRunner.query(`DROP TABLE "talonario_usuarios"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_un_talonario_por_empresa_serie"`);
    await queryRunner.query(`DROP TABLE "talonarios"`);
  }
}
