import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fidelización por puntos: se gana al emitir una venta con cliente identificado (según la
 * tasa configurada en `configuraciones`) y se canjea o ajusta a mano. El saldo de un cliente
 * nunca se guarda como un número aparte — es la suma con signo de sus movimientos en
 * `movimientos_fidelizacion` (mismo criterio que `existencias`, ver
 * `movimiento-fidelizacion.entity.ts`).
 */
export class Fidelizacion1789010000000 implements MigrationInterface {
  name = 'Fidelizacion1789010000000';

  private readonly permisos: Array<[string, string]> = [
    ['fidelizacion.ver', 'Ver el programa de fidelización y el saldo de puntos de los clientes'],
    ['fidelizacion.gestionar', 'Canjear o ajustar puntos de fidelización'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Configuración del programa (mismos parámetros por empresa que el resto de
    // `configuraciones`) --------------------------------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "configuraciones"
        ADD COLUMN "fidelizacion_activa" boolean NOT NULL DEFAULT false,
        ADD COLUMN "soles_por_punto" numeric(10,2) NOT NULL DEFAULT 10,
        ADD COLUMN "valor_canje_punto" numeric(10,2) NOT NULL DEFAULT 0.10
    `);

    // --- movimientos_fidelizacion -----------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "movimientos_fidelizacion_tipo_enum" AS ENUM ('ganado', 'canjeado', 'ajuste')
    `);

    await queryRunner.query(`
      CREATE TABLE "movimientos_fidelizacion" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "cliente_id" uuid NOT NULL,
        "tipo" "movimientos_fidelizacion_tipo_enum" NOT NULL,
        "puntos" integer NOT NULL,
        "venta_id" uuid,
        "usuario_id" uuid,
        "observacion" character varying(255),
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_movimientos_fidelizacion" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_movimientos_fidelizacion_cliente" ON "movimientos_fidelizacion" ("empresa_id", "cliente_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "movimientos_fidelizacion" ADD CONSTRAINT "FK_movimientos_fidelizacion_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_fidelizacion" ADD CONSTRAINT "FK_movimientos_fidelizacion_cliente" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_fidelizacion" ADD CONSTRAINT "FK_movimientos_fidelizacion_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "movimientos_fidelizacion" ADD CONSTRAINT "FK_movimientos_fidelizacion_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "movimientos_fidelizacion" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "movimientos_fidelizacion" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "movimientos_fidelizacion"
        USING (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
        WITH CHECK (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
    `);

    for (const [codigo, descripcion] of this.permisos) {
      await queryRunner.query(
        `INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2) ON CONFLICT ("codigo") DO NOTHING`,
        [codigo, descripcion],
      );
    }

    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    await queryRunner.query(
      `INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
       SELECT r."id", p."id"
       FROM "roles" r, "permisos" p
       WHERE r."nombre" = 'Administrador' AND p."codigo" = ANY($1::text[])
       ON CONFLICT DO NOTHING`,
      [this.permisos.map(([codigo]) => codigo)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    await queryRunner.query(
      `DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "codigo" = ANY($1::text[]))`,
      [this.permisos.map(([codigo]) => codigo)],
    );
    await queryRunner.query(`DELETE FROM "permisos" WHERE "codigo" = ANY($1::text[])`, [
      this.permisos.map(([codigo]) => codigo),
    ]);

    await queryRunner.query(
      `DROP POLICY IF EXISTS "aislamiento_empresa" ON "movimientos_fidelizacion"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "movimientos_fidelizacion"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "movimientos_fidelizacion_tipo_enum"`);

    await queryRunner.query(`
      ALTER TABLE "configuraciones"
        DROP COLUMN "fidelizacion_activa",
        DROP COLUMN "soles_por_punto",
        DROP COLUMN "valor_canje_punto"
    `);
  }
}
