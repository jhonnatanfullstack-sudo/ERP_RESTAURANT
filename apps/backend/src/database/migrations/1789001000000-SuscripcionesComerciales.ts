import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Página de precios y activación por meses pagados (FASE 29).
 *
 * `empresas` gana `plan_contratado` (qué plan compró, solo metadato — no restringe acceso
 * todavía) y `suscripcion_expira_en` (hasta cuándo cubre lo pagado; `NULL` sigue significando
 * "activada sin plazo", como ya funcionaba el botón "Activar" del panel del proveedor).
 *
 * `solicitudes_suscripcion` es el pedido de un restaurante de contratar/renovar un plan —
 * bajo RLS como cualquier tabla de negocio, con el mismo patrón que `configuraciones`
 * (FASE 21): una fila por evento, `empresa_id` obligatorio.
 */
export class SuscripcionesComerciales1789001000000 implements MigrationInterface {
  name = 'SuscripcionesComerciales1789001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "empresas_plan_contratado_enum" AS ENUM ('operativo', 'facturacion', 'completo')`,
    );
    await queryRunner.query(`
      ALTER TABLE "empresas"
        ADD COLUMN "plan_contratado" "empresas_plan_contratado_enum",
        ADD COLUMN "suscripcion_expira_en" timestamptz
    `);

    await queryRunner.query(
      `CREATE TYPE "solicitudes_suscripcion_plan_enum" AS ENUM ('operativo', 'facturacion', 'completo')`,
    );
    await queryRunner.query(
      `CREATE TYPE "solicitudes_suscripcion_ciclo_enum" AS ENUM ('mensual', 'trimestral', 'anual')`,
    );
    await queryRunner.query(
      `CREATE TYPE "solicitudes_suscripcion_estado_enum" AS ENUM ('pendiente', 'confirmada', 'rechazada')`,
    );

    await queryRunner.query(`
      CREATE TABLE "solicitudes_suscripcion" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "plan" "solicitudes_suscripcion_plan_enum" NOT NULL,
        "ciclo" "solicitudes_suscripcion_ciclo_enum" NOT NULL,
        "meses" smallint NOT NULL,
        "monto" numeric(10,2) NOT NULL,
        "estado" "solicitudes_suscripcion_estado_enum" NOT NULL DEFAULT 'pendiente',
        "mensaje_contacto" varchar(500),
        "referencia_pago" varchar(100),
        "confirmado_en" timestamptz,
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_solicitudes_suscripcion" PRIMARY KEY ("id"),
        CONSTRAINT "FK_solicitudes_suscripcion_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_solicitudes_suscripcion_empresa" ON "solicitudes_suscripcion" ("empresa_id")`,
    );
    // El panel busca pendientes de todas las empresas a la vez (ver `listarSolicitudesPendientes`).
    await queryRunner.query(
      `CREATE INDEX "IDX_solicitudes_suscripcion_estado" ON "solicitudes_suscripcion" ("estado")`,
    );

    await queryRunner.query(`ALTER TABLE "solicitudes_suscripcion" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "solicitudes_suscripcion" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "solicitudes_suscripcion"
        USING (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
        WITH CHECK (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "solicitudes_suscripcion"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "solicitudes_suscripcion_estado_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "solicitudes_suscripcion_ciclo_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "solicitudes_suscripcion_plan_enum"`);

    await queryRunner.query(`
      ALTER TABLE "empresas"
        DROP COLUMN IF EXISTS "plan_contratado",
        DROP COLUMN IF EXISTS "suscripcion_expira_en"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "empresas_plan_contratado_enum"`);
  }
}
