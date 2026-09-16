import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notificaciones del equipo: una bandeja compartida por empresa (ver `notificacion.entity.ts`)
 * que se llena desde el propio backend — comanda lista para entregar, pedido nuevo desde la
 * carta pública, reclamo nuevo — y se empuja en vivo por el mismo WebSocket que ya usa Cocina
 * (`realtime/socket.ts`), sin abrir un segundo canal.
 */
export class Notificaciones1789009000000 implements MigrationInterface {
  name = 'Notificaciones1789009000000';

  private readonly permisos: Array<[string, string]> = [
    ['notificaciones.ver', 'Ver y marcar como leídas las notificaciones del equipo'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "notificaciones_tipo_enum" AS ENUM ('comanda_lista', 'pedido_nuevo', 'reclamo_nuevo')
    `);

    await queryRunner.query(`
      CREATE TABLE "notificaciones" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "tipo" "notificaciones_tipo_enum" NOT NULL,
        "titulo" character varying(150) NOT NULL,
        "mensaje" character varying(300) NOT NULL,
        "entidad_tipo" character varying(30),
        "entidad_id" uuid,
        "leida" boolean NOT NULL DEFAULT false,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notificaciones" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notificaciones_empresa_creado" ON "notificaciones" ("empresa_id", "creado_en")`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificaciones" ADD CONSTRAINT "FK_notificaciones_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "notificaciones" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "notificaciones" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "notificaciones"
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

    await queryRunner.query(`DROP POLICY IF EXISTS "aislamiento_empresa" ON "notificaciones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notificaciones"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notificaciones_tipo_enum"`);
  }
}
