import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Certificado digital y credenciales del OSE por empresa (FASE 28) — lo que le faltaba a
 * `modules/facturacion` (ya tenía el armado del XML UBL 2.1 y la firma, ver FASE 14 y el propio
 * módulo) para poder emitir de verdad: dónde guardar, cifrados, el `.pfx` de cada empresa y sus
 * credenciales del OSE elegido.
 *
 * Va bajo RLS con el mismo patrón que `configuraciones` (FASE 21): una fila por empresa,
 * `empresa_id` único, política `aislamiento_empresa`.
 */
export class ConfiguracionFacturacionElectronica1789000800000 implements MigrationInterface {
  name = 'ConfiguracionFacturacionElectronica1789000800000';

  private readonly codigos: Array<[string, string]> = [
    ['facturacion.ver', 'Ver el estado de los comprobantes electrónicos'],
    ['facturacion.configurar', 'Configurar el certificado digital y el OSE de la empresa'],
    ['facturacion.emitir', 'Emitir o reintentar el envío de un comprobante electrónico'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "configuraciones_facturacion_ose_proveedor_enum" AS ENUM ('nubefact')
    `);
    await queryRunner.query(`
      CREATE TYPE "configuraciones_facturacion_ambiente_enum" AS ENUM ('beta', 'produccion')
    `);

    await queryRunner.query(`
      CREATE TABLE "configuraciones_facturacion" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "ose_proveedor" "configuraciones_facturacion_ose_proveedor_enum",
        "ose_usuario" varchar(100),
        "ose_credencial_cifrada" bytea,
        "certificado_pfx_cifrado" bytea,
        "certificado_contrasena_cifrada" bytea,
        "certificado_valido_hasta" date,
        "ambiente" "configuraciones_facturacion_ambiente_enum" NOT NULL DEFAULT 'beta',
        "activo" boolean NOT NULL DEFAULT false,
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_configuraciones_facturacion" PRIMARY KEY ("id"),
        CONSTRAINT "FK_configuraciones_facturacion_empresa" FOREIGN KEY ("empresa_id")
          REFERENCES "empresas"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_configuraciones_facturacion_empresa"
        ON "configuraciones_facturacion" ("empresa_id")
    `);

    await queryRunner.query(`ALTER TABLE "configuraciones_facturacion" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "configuraciones_facturacion" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "configuraciones_facturacion"
        USING (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
        WITH CHECK (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
    `);

    // Qué OSE tramitó cada envío — informativo/auditoría, no gobierna nada en el código.
    await queryRunner.query(`
      ALTER TABLE "comprobantes_electronicos" ADD COLUMN "ose_proveedor" varchar(20)
    `);

    for (const [codigo, descripcion] of this.codigos) {
      await queryRunner.query(
        `INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2)
         ON CONFLICT ("codigo") DO NOTHING`,
        [codigo, descripcion],
      );
    }

    // Mismo criterio que `Configuraciones1789000600000`: el catálogo de permisos y `roles`
    // están bajo RLS, así que hace falta el bypass para alcanzar el Administrador de cada
    // empresa, no solo el de la primera.
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

    await queryRunner.query(
      `ALTER TABLE "comprobantes_electronicos" DROP COLUMN IF EXISTS "ose_proveedor"`,
    );

    await queryRunner.query(`DROP TABLE IF EXISTS "configuraciones_facturacion"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "configuraciones_facturacion_ambiente_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "configuraciones_facturacion_ose_proveedor_enum"`);
  }
}
