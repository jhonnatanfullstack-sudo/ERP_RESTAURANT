import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guía de Remisión Electrónica (GRE) del remitente — comprobante `09`, obligatoria desde
 * jul-2026 para trasladar insumos/mercadería sin exponerse a que SUNAT intervenga el
 * transporte (RS 000108-2026/SUNAT). Mismo patrón que `ComprobantesElectronicos1788990000000`:
 * XML UBL 2.1 firmado + CDR en su propia tabla, más los dos catálogos SUNAT que le faltaban al
 * sistema (motivo de traslado N°20, modalidad de traslado N°18) y el código `09` ya cargado en
 * `tipos_comprobante` desde el seed inicial.
 *
 * `guias_remision` numera con el mismo mecanismo de `talonarios` que usan las ventas (serie +
 * correlativo), pero en su propio índice único — es un libro de correlativos independiente del
 * de `ventas`, aunque ambos puedan compartir el mismo talonario configurado con serie `T001`.
 */
export class GuiasRemisionSunat1789002000000 implements MigrationInterface {
  name = 'GuiasRemisionSunat1789002000000';

  private readonly motivosTraslado: Array<[string, string]> = [
    ['01', 'Venta'],
    ['02', 'Compra'],
    ['04', 'Traslado entre establecimientos de la misma empresa'],
    ['13', 'Otros'],
  ];

  private readonly modalidadesTraslado: Array<[string, string]> = [
    ['01', 'Transporte público'],
    ['02', 'Transporte privado'],
  ];

  private readonly permisos: Array<[string, string]> = [
    ['guias_remision.ver', 'Ver guías de remisión electrónica'],
    ['guias_remision.crear', 'Registrar una guía de remisión'],
    ['guias_remision.emitir', 'Emitir o reintentar el envío de una guía de remisión'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Catálogos SUNAT N°20 y N°18 (globales, sin empresa_id, mismo criterio que
    // tipos_comprobante/unidades_medida) ------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "motivos_traslado" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "codigo" character varying(2) NOT NULL,
        "nombre" character varying(100) NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_motivos_traslado_codigo" UNIQUE ("codigo"),
        CONSTRAINT "PK_motivos_traslado" PRIMARY KEY ("id")
      )
    `);
    for (const [codigo, nombre] of this.motivosTraslado) {
      await queryRunner.query(
        `INSERT INTO "motivos_traslado" ("codigo", "nombre") VALUES ($1, $2)`,
        [codigo, nombre],
      );
    }

    await queryRunner.query(`
      CREATE TABLE "modalidades_traslado" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "codigo" character varying(2) NOT NULL,
        "nombre" character varying(100) NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_modalidades_traslado_codigo" UNIQUE ("codigo"),
        CONSTRAINT "PK_modalidades_traslado" PRIMARY KEY ("id")
      )
    `);
    for (const [codigo, nombre] of this.modalidadesTraslado) {
      await queryRunner.query(
        `INSERT INTO "modalidades_traslado" ("codigo", "nombre") VALUES ($1, $2)`,
        [codigo, nombre],
      );
    }

    // --- guias_remision ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "guias_remision_estado_enum" AS ENUM (
        'pendiente', 'aceptado', 'observado', 'rechazado', 'error_envio'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "guias_remision" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "talonario_id" uuid NOT NULL,
        "serie" character varying(4) NOT NULL,
        "numero" integer NOT NULL,
        "venta_id" uuid,
        "motivo_traslado_id" uuid NOT NULL,
        "modalidad_traslado_id" uuid NOT NULL,
        "fecha_traslado" date NOT NULL,
        "peso_total_kg" numeric(10,2) NOT NULL,
        "numero_bultos" integer,
        "partida_direccion" character varying(255) NOT NULL,
        "partida_ubigeo" character varying(6),
        "llegada_direccion" character varying(255) NOT NULL,
        "llegada_ubigeo" character varying(6),
        "destinatario_numero_documento" character varying(15),
        "destinatario_nombre" character varying(150),
        "transportista_placa" character varying(8),
        "transportista_licencia" character varying(20),
        "transportista_ruc" character varying(11),
        "transportista_razon_social" character varying(150),
        "observacion" character varying(255),
        "nombre_archivo" character varying(60) NOT NULL,
        "estado" "guias_remision_estado_enum" NOT NULL DEFAULT 'pendiente',
        "xml_firmado" text NOT NULL,
        "hash_firma" character varying(100) NOT NULL,
        "cdr_xml" text,
        "codigo_respuesta" character varying(10),
        "mensaje_respuesta" character varying(500),
        "intentos" integer NOT NULL DEFAULT 0,
        "enviado_en" TIMESTAMP WITH TIME ZONE,
        "ose_proveedor" character varying(20),
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_guias_remision_nombre_archivo" UNIQUE ("nombre_archivo"),
        CONSTRAINT "PK_guias_remision" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_un_correlativo_por_serie_guia" ON "guias_remision" ("empresa_id", "serie", "numero")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_guia_remision_estado" ON "guias_remision" ("estado")`,
    );

    await queryRunner.query(
      `ALTER TABLE "guias_remision" ADD CONSTRAINT "FK_guias_remision_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "guias_remision" ADD CONSTRAINT "FK_guias_remision_talonario" FOREIGN KEY ("talonario_id") REFERENCES "talonarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "guias_remision" ADD CONSTRAINT "FK_guias_remision_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "guias_remision" ADD CONSTRAINT "FK_guias_remision_motivo_traslado" FOREIGN KEY ("motivo_traslado_id") REFERENCES "motivos_traslado"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "guias_remision" ADD CONSTRAINT "FK_guias_remision_modalidad_traslado" FOREIGN KEY ("modalidad_traslado_id") REFERENCES "modalidades_traslado"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "guias_remision" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "guias_remision" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "guias_remision"
        USING (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
        WITH CHECK (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
    `);

    // --- detalle_guias_remision ------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "detalle_guias_remision" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "guia_remision_id" uuid NOT NULL,
        "descripcion" character varying(150) NOT NULL,
        "cantidad" numeric(10,2) NOT NULL,
        "unidad_medida_id" uuid NOT NULL,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_detalle_guias_remision" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "detalle_guias_remision" ADD CONSTRAINT "FK_detalle_guias_remision_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_guias_remision" ADD CONSTRAINT "FK_detalle_guias_remision_guia" FOREIGN KEY ("guia_remision_id") REFERENCES "guias_remision"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_guias_remision" ADD CONSTRAINT "FK_detalle_guias_remision_unidad_medida" FOREIGN KEY ("unidad_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "detalle_guias_remision" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "detalle_guias_remision" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "detalle_guias_remision"
        USING (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
        WITH CHECK (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
    `);

    // --- Permisos ---------------------------------------------------------------------------
    for (const [codigo, descripcion] of this.permisos) {
      await queryRunner.query(
        `INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2) ON CONFLICT ("codigo") DO NOTHING`,
        [codigo, descripcion],
      );
    }

    // roles/permisos están bajo RLS: hace falta el bypass para alcanzar el Administrador de
    // cada empresa, no solo el de la primera (mismo criterio que otras migraciones post-RLS).
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

    await queryRunner.query(`DROP TABLE IF EXISTS "detalle_guias_remision"`);

    await queryRunner.query(`DROP POLICY IF EXISTS "aislamiento_empresa" ON "guias_remision"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_guia_remision_estado"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_un_correlativo_por_serie_guia"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "guias_remision"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "guias_remision_estado_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "modalidades_traslado"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "motivos_traslado"`);
  }
}
