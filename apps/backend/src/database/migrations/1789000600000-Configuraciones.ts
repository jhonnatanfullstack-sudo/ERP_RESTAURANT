import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuración operativa por empresa (FASE 21).
 *
 * Recoge lo que hasta ahora eran constantes escritas en el código —duración de una reserva,
 * días de crédito, refresco de cocina, umbrales de food cost— más los datos que la carta
 * pública necesitaba y no tenía dónde guardar (horario, redes, mensaje de bienvenida).
 *
 * **No se siembra ninguna fila.** Los valores por defecto viven en el service
 * (`CONFIGURACION_POR_DEFECTO`) y la fila se crea recién cuando una empresa guarda su
 * configuración por primera vez. Así no hace falta un backfill ahora ni sembrar una fila por
 * cada empresa nueva, y una empresa que nunca abra esa pantalla se comporta exactamente como
 * antes de esta fase.
 *
 * Va bajo RLS como cualquier tabla de negocio, con `empresa_id` único: la configuración es
 * una por empresa, no una lista.
 */
export class Configuraciones1789000600000 implements MigrationInterface {
  name = 'Configuraciones1789000600000';

  private readonly codigos: Array<[string, string]> = [
    ['configuracion.ver', 'Ver la configuración del restaurante'],
    ['configuracion.editar', 'Editar la configuración del restaurante'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "configuraciones" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "duracion_reserva_minutos" smallint NOT NULL DEFAULT 90,
        "segundos_refresco_cocina" smallint NOT NULL DEFAULT 8,
        "dias_credito_por_defecto" smallint NOT NULL DEFAULT 30,
        "food_cost_objetivo" smallint NOT NULL DEFAULT 35,
        "food_cost_critico" smallint NOT NULL DEFAULT 50,
        "horario_atencion" varchar(255),
        "mensaje_bienvenida" varchar(500),
        "acepta_pedidos_whatsapp" boolean NOT NULL DEFAULT true,
        "facebook_url" varchar(255),
        "instagram_url" varchar(255),
        "tiktok_url" varchar(255),
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_configuraciones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_configuraciones_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_food_cost_coherente" CHECK ("food_cost_critico" > "food_cost_objetivo")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_configuraciones_empresa" ON "configuraciones" ("empresa_id")
    `);

    await queryRunner.query(`ALTER TABLE "configuraciones" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "configuraciones" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "configuraciones"
        USING (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
        WITH CHECK (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
    `);

    // `permisos` y `roles_permisos` no están bajo RLS, pero `roles` sí: el SELECT que busca
    // el rol Administrador de cada empresa necesita el bypass para verlos todos.
    for (const [codigo, descripcion] of this.codigos) {
      await queryRunner.query(
        `INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2)
         ON CONFLICT ("codigo") DO NOTHING`,
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
      [this.codigos.map(([codigo]) => codigo)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    await queryRunner.query(
      `DELETE FROM "roles_permisos"
        WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "codigo" = ANY($1::text[]))`,
      [this.codigos.map(([codigo]) => codigo)],
    );
    await queryRunner.query(`DELETE FROM "permisos" WHERE "codigo" = ANY($1::text[])`, [
      this.codigos.map(([codigo]) => codigo),
    ]);
    await queryRunner.query(`DROP TABLE IF EXISTS "configuraciones"`);
  }
}
