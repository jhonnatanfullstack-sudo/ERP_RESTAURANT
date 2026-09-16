import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notas de Crédito (07) y Débito (08): la única forma legal de corregir o complementar una
 * `Venta` cuyo comprobante electrónico ya fue aceptado por SUNAT — a partir de ahora
 * `venta.service.ts: anularVenta` rechaza anular directamente una venta en ese estado y pide
 * registrar una nota en su lugar. Mismo patrón que `GuiasRemisionSunat1789002000000`: XML UBL
 * 2.1 firmado + CDR en su propia tabla (no en `comprobantes_electronicos`, que es 1 a 1 con
 * `Venta`), numeración por talonario igual que ventas/guías, y el catálogo SUNAT que faltaba
 * (N°09 motivo de Nota de Crédito, N°10 motivo de Nota de Débito) — los códigos `07`/`08` de
 * tipo de comprobante ya estaban cargados desde el seed inicial.
 */
export class NotasCreditoDebito1789007000000 implements MigrationInterface {
  name = 'NotasCreditoDebito1789007000000';

  private readonly motivosCredito: Array<[string, string]> = [
    ['01', 'Anulación de la operación'],
    ['02', 'Anulación por error en el RUC'],
    ['03', 'Corrección por error en la descripción'],
    ['04', 'Descuento global'],
    ['05', 'Descuento por ítem'],
    ['06', 'Devolución total'],
    ['07', 'Devolución por ítem'],
    ['08', 'Bonificación'],
    ['09', 'Disminución en el valor'],
    ['10', 'Otros conceptos'],
  ];

  private readonly motivosDebito: Array<[string, string]> = [
    ['01', 'Intereses por mora'],
    ['02', 'Aumento en el valor'],
    ['03', 'Penalidades'],
    ['10', 'Otros conceptos'],
  ];

  private readonly permisos: Array<[string, string]> = [
    ['notas_venta.ver', 'Ver notas de crédito y débito'],
    ['notas_venta.crear', 'Registrar una nota de crédito o débito'],
    ['notas_venta.emitir', 'Emitir o reintentar el envío de una nota'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Catálogo SUNAT N°09/N°10 (global, sin empresa_id, mismo criterio que
    // motivos_traslado) ------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "motivos_nota" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tipo_documento" character varying(2) NOT NULL,
        "codigo" character varying(2) NOT NULL,
        "nombre" character varying(100) NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_motivos_nota" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_motivos_nota_tipo_codigo" ON "motivos_nota" ("tipo_documento", "codigo")`,
    );
    for (const [codigo, nombre] of this.motivosCredito) {
      await queryRunner.query(
        `INSERT INTO "motivos_nota" ("tipo_documento", "codigo", "nombre") VALUES ('07', $1, $2)`,
        [codigo, nombre],
      );
    }
    for (const [codigo, nombre] of this.motivosDebito) {
      await queryRunner.query(
        `INSERT INTO "motivos_nota" ("tipo_documento", "codigo", "nombre") VALUES ('08', $1, $2)`,
        [codigo, nombre],
      );
    }

    // --- notas_venta -----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TYPE "notas_venta_estado_enum" AS ENUM (
        'pendiente', 'aceptado', 'observado', 'rechazado', 'error_envio'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notas_venta" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "talonario_id" uuid NOT NULL,
        "serie" character varying(4) NOT NULL,
        "numero" integer NOT NULL,
        "tipo_comprobante_id" uuid NOT NULL,
        "venta_id" uuid NOT NULL,
        "motivo_id" uuid NOT NULL,
        "descripcion_sustento" character varying(255),
        "subtotal" numeric(10,2) NOT NULL,
        "igv" numeric(10,2) NOT NULL,
        "total" numeric(10,2) NOT NULL,
        "nombre_archivo" character varying(60) NOT NULL,
        "estado" "notas_venta_estado_enum" NOT NULL DEFAULT 'pendiente',
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
        CONSTRAINT "UQ_notas_venta_nombre_archivo" UNIQUE ("nombre_archivo"),
        CONSTRAINT "PK_notas_venta" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_un_correlativo_por_serie_nota" ON "notas_venta" ("empresa_id", "serie", "numero")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_nota_venta_estado" ON "notas_venta" ("estado")`);

    await queryRunner.query(
      `ALTER TABLE "notas_venta" ADD CONSTRAINT "FK_notas_venta_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_venta" ADD CONSTRAINT "FK_notas_venta_talonario" FOREIGN KEY ("talonario_id") REFERENCES "talonarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_venta" ADD CONSTRAINT "FK_notas_venta_tipo_comprobante" FOREIGN KEY ("tipo_comprobante_id") REFERENCES "tipos_comprobante"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_venta" ADD CONSTRAINT "FK_notas_venta_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notas_venta" ADD CONSTRAINT "FK_notas_venta_motivo" FOREIGN KEY ("motivo_id") REFERENCES "motivos_nota"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "notas_venta" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "notas_venta" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "notas_venta"
        USING (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
        WITH CHECK (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
    `);

    // --- detalle_notas_venta -----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "detalle_notas_venta" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "nota_venta_id" uuid NOT NULL,
        "producto_id" uuid,
        "descripcion_producto" character varying(150) NOT NULL,
        "cantidad" smallint NOT NULL,
        "precio_unitario" numeric(10,2) NOT NULL,
        "tipo_afectacion_igv_id" uuid NOT NULL,
        "valor_venta" numeric(10,2) NOT NULL,
        "igv" numeric(10,2) NOT NULL,
        "subtotal" numeric(10,2) NOT NULL,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_detalle_notas_venta" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "detalle_notas_venta" ADD CONSTRAINT "FK_detalle_notas_venta_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_notas_venta" ADD CONSTRAINT "FK_detalle_notas_venta_nota" FOREIGN KEY ("nota_venta_id") REFERENCES "notas_venta"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_notas_venta" ADD CONSTRAINT "FK_detalle_notas_venta_producto" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_notas_venta" ADD CONSTRAINT "FK_detalle_notas_venta_afectacion" FOREIGN KEY ("tipo_afectacion_igv_id") REFERENCES "tipos_afectacion_igv"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "detalle_notas_venta" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "detalle_notas_venta" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "detalle_notas_venta"
        USING (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
        WITH CHECK (
          "empresa_id" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
          OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
        )
    `);

    // --- Permisos ----------------------------------------------------------------------------
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

    await queryRunner.query(`DROP TABLE IF EXISTS "detalle_notas_venta"`);

    await queryRunner.query(`DROP POLICY IF EXISTS "aislamiento_empresa" ON "notas_venta"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_nota_venta_estado"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_un_correlativo_por_serie_nota"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notas_venta"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notas_venta_estado_enum"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "motivos_nota"`);
  }
}
