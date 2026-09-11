import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de uso diario por empresa (FASE 26): cuántas peticiones y cuántas escrituras hizo
 * cada empresa cada día, y cuándo fue su último acceso. Es lo que le permite al proveedor
 * distinguir una demo que se está usando de verdad de una que se abrió una vez.
 *
 * Va bajo RLS como cualquier otra tabla de negocio: cada empresa solo ve su propio uso. El
 * panel del proveedor la consulta con el bypass explícito.
 */
export class RegistrosUso1789000300000 implements MigrationInterface {
  name = 'RegistrosUso1789000300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "registros_uso" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "fecha" date NOT NULL,
        "peticiones" integer NOT NULL DEFAULT 0,
        "escrituras" integer NOT NULL DEFAULT 0,
        "ultimo_acceso" timestamptz NOT NULL,
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_registros_uso" PRIMARY KEY ("id"),
        CONSTRAINT "FK_registros_uso_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE CASCADE
      )
    `);
    // Único por (empresa, día): es la clave del UPSERT que acumula los contadores.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_registro_uso_empresa_fecha" ON "registros_uso" ("empresa_id", "fecha")
    `);

    await queryRunner.query(`ALTER TABLE "registros_uso" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "registros_uso" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "registros_uso"
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
    await queryRunner.query(`DROP TABLE IF EXISTS "registros_uso"`);
  }
}
