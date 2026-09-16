import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Libro de Reclamaciones Virtual (Ley 29571 y su reglamento, D.S. 101-2022-PCM): todo negocio
 * que atiende público en Perú debe tenerlo, accesible sin exigirle al consumidor ser cliente
 * ni presentar boleta. Se llena desde la carta pública sin autenticarse — mismo patrón que
 * `guias_remision`/`pedidos` públicos: numeración propia por empresa (sin serie ni talonario,
 * un reclamo no es un comprobante SUNAT) y RLS para que una empresa no vea los reclamos de otra.
 */
export class LibroReclamaciones1789005000000 implements MigrationInterface {
  name = 'LibroReclamaciones1789005000000';

  private readonly permisos: Array<[string, string]> = [
    ['reclamaciones.ver', 'Ver el Libro de Reclamaciones'],
    ['reclamaciones.responder', 'Responder un reclamo o queja'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "reclamaciones_tipo_enum" AS ENUM ('reclamo', 'queja')
    `);
    await queryRunner.query(`
      CREATE TYPE "reclamaciones_estado_enum" AS ENUM ('pendiente', 'atendido')
    `);

    await queryRunner.query(`
      CREATE TABLE "reclamaciones" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "empresa_id" uuid NOT NULL DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid,
        "numero" integer NOT NULL,
        "tipo" "reclamaciones_tipo_enum" NOT NULL,
        "consumidor_nombres" character varying(150) NOT NULL,
        "consumidor_apellidos" character varying(150) NOT NULL,
        "tipo_documento_identidad_id" uuid NOT NULL,
        "consumidor_numero_documento" character varying(15) NOT NULL,
        "consumidor_domicilio" character varying(255) NOT NULL,
        "consumidor_email" character varying(150) NOT NULL,
        "consumidor_telefono" character varying(20),
        "es_menor_edad" boolean NOT NULL DEFAULT false,
        "apoderado_nombre" character varying(150),
        "apoderado_numero_documento" character varying(15),
        "descripcion_bien" character varying(255) NOT NULL,
        "monto_reclamado" numeric(10,2),
        "detalle" text NOT NULL,
        "pedido" text NOT NULL,
        "estado" "reclamaciones_estado_enum" NOT NULL DEFAULT 'pendiente',
        "respuesta_proveedor" text,
        "fecha_respuesta" TIMESTAMP WITH TIME ZONE,
        "usuario_atendio_id" uuid,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reclamaciones" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_un_correlativo_reclamacion_por_empresa" ON "reclamaciones" ("empresa_id", "numero")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_reclamacion_estado" ON "reclamaciones" ("estado")`);

    await queryRunner.query(
      `ALTER TABLE "reclamaciones" ADD CONSTRAINT "FK_reclamaciones_empresa" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reclamaciones" ADD CONSTRAINT "FK_reclamaciones_tipo_documento" FOREIGN KEY ("tipo_documento_identidad_id") REFERENCES "tipos_documento_identidad"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reclamaciones" ADD CONSTRAINT "FK_reclamaciones_usuario_atendio" FOREIGN KEY ("usuario_atendio_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(`ALTER TABLE "reclamaciones" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "reclamaciones" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "reclamaciones"
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

    await queryRunner.query(`DROP TABLE IF EXISTS "reclamaciones"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reclamaciones_estado_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reclamaciones_tipo_enum"`);
  }
}
