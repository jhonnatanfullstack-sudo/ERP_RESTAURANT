import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turnos de personal: registro de inicio y fin de jornada por usuario ("Iniciar turno" /
 * "Terminar turno"), complemento del módulo de Caja (una caja es un solo cajón compartido por
 * empresa; un turno es de cada persona). A diferencia de `cajas`, pueden convivir varios
 * turnos abiertos a la vez — un mesero y un cocinero trabajando en simultáneo son dos filas,
 * no una — así que el índice único de "uno abierto a la vez" es por usuario, no por empresa.
 */
export class TurnosDePersonal1789006000000 implements MigrationInterface {
  name = 'TurnosDePersonal1789006000000';

  private readonly permisos: Array<[string, string]> = [
    ['turnos.ver', 'Ver los turnos de personal'],
    ['turnos.abrir', 'Iniciar un turno'],
    ['turnos.cerrar', 'Terminar un turno'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "turnos_estado_enum" AS ENUM ('abierto', 'cerrado')
    `);

    await queryRunner.query(`
      CREATE TABLE "turnos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "usuario_id" uuid NOT NULL,
        "usuario_cierre_id" uuid,
        "nota_apertura" character varying(255),
        "nota_cierre" character varying(255),
        "estado" "turnos_estado_enum" NOT NULL DEFAULT 'abierto',
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "fecha_cierre" TIMESTAMP WITH TIME ZONE,
        "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_turnos" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_un_turno_abierto_por_usuario" ON "turnos" ("empresa_id", "usuario_id") WHERE "estado" = 'abierto'`,
    );

    await queryRunner.query(
      `ALTER TABLE "turnos" ADD CONSTRAINT "FK_turnos_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos" ADD CONSTRAINT "FK_turnos_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "turnos" ADD CONSTRAINT "FK_turnos_usuario_cierre" FOREIGN KEY ("usuario_cierre_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "turnos" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "turnos" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "turnos"
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

    await queryRunner.query(`DROP TABLE IF EXISTS "turnos"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "turnos_estado_enum"`);
  }
}
