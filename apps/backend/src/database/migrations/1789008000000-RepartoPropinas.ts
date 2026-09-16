import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reparto de propinas entre el personal que trabajó un período. No inventa un nuevo concepto
 * de "mesero asignado" en Pedidos/Ventas (Regla 3 de CLAUDE.md): los participantes salen de
 * `turnos` — quien tuvo un turno cerrado dentro del rango trabajó ese rango — y el total sale
 * de `ventas.propina`, ya existente desde el módulo de Yape/Plin. Es un registro de cierre, no
 * editable después (mismo criterio que `cajas`): el monto de cada quien queda congelado al
 * repartirse.
 */
export class RepartoPropinas1789008000000 implements MigrationInterface {
  name = 'RepartoPropinas1789008000000';

  private readonly permisos: Array<[string, string]> = [
    ['propinas.ver', 'Ver los repartos de propinas'],
    ['propinas.repartir', 'Registrar un reparto de propinas'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "repartos_propinas_metodo_enum" AS ENUM ('igualitario', 'por_horas')
    `);

    await queryRunner.query(`
      CREATE TABLE "repartos_propinas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "fecha_desde" TIMESTAMP WITH TIME ZONE NOT NULL,
        "fecha_hasta" TIMESTAMP WITH TIME ZONE NOT NULL,
        "metodo" "repartos_propinas_metodo_enum" NOT NULL,
        "total_propinas" numeric(10,2) NOT NULL,
        "usuario_registro_id" uuid NOT NULL,
        "observacion" character varying(255),
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_repartos_propinas" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "repartos_propinas" ADD CONSTRAINT "FK_repartos_propinas_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "repartos_propinas" ADD CONSTRAINT "FK_repartos_propinas_usuario_registro" FOREIGN KEY ("usuario_registro_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "repartos_propinas" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "repartos_propinas" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "repartos_propinas"
        USING (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
        WITH CHECK (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
    `);

    await queryRunner.query(`
      CREATE TABLE "detalle_repartos_propinas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "reparto_propina_id" uuid NOT NULL,
        "usuario_id" uuid NOT NULL,
        "horas_trabajadas" numeric(8,2),
        "monto" numeric(10,2) NOT NULL,
        CONSTRAINT "PK_detalle_repartos_propinas" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "detalle_repartos_propinas" ADD CONSTRAINT "FK_detalle_repartos_propinas_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_repartos_propinas" ADD CONSTRAINT "FK_detalle_repartos_propinas_reparto" FOREIGN KEY ("reparto_propina_id") REFERENCES "repartos_propinas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_repartos_propinas" ADD CONSTRAINT "FK_detalle_repartos_propinas_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "detalle_repartos_propinas" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "detalle_repartos_propinas" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "detalle_repartos_propinas"
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

    await queryRunner.query(`DROP TABLE IF EXISTS "detalle_repartos_propinas"`);
    await queryRunner.query(`DROP POLICY IF EXISTS "aislamiento_empresa" ON "repartos_propinas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "repartos_propinas"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "repartos_propinas_metodo_enum"`);
  }
}
