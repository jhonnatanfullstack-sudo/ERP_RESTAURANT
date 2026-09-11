import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bitácora de auditoría (FASE 20) y su permiso de lectura. La tabla solo se escribe desde el
 * middleware y se lee desde la pantalla de Auditoría: no hay endpoints de edición ni borrado
 * a propósito, porque una bitácora que se puede alterar no sirve como auditoría.
 */
export class RegistrosAuditoria1788991000000 implements MigrationInterface {
  name = 'RegistrosAuditoria1788991000000';

  private readonly codigo = 'auditoria.ver';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "registros_auditoria_accion_enum" AS ENUM (
        'crear', 'actualizar', 'eliminar', 'anular', 'login', 'login_fallido', 'logout'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "registros_auditoria" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "usuario_id" uuid,
        "accion" "registros_auditoria_accion_enum" NOT NULL,
        "modulo" character varying(50) NOT NULL,
        "recurso_id" character varying(100),
        "metodo" character varying(10) NOT NULL,
        "ruta" character varying(255) NOT NULL,
        "estado_http" integer NOT NULL,
        "ip" character varying(60),
        "datos" jsonb,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_registros_auditoria" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auditoria_usuario" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);

    // La bitácora se consulta siempre "lo último primero" y filtrando por módulo.
    await queryRunner.query(
      `CREATE INDEX "IDX_auditoria_creado_en" ON "registros_auditoria" ("creado_en")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_auditoria_modulo_fecha" ON "registros_auditoria" ("modulo", "creado_en")`,
    );

    await queryRunner.query(`INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2)`, [
      this.codigo,
      'Ver la bitácora de auditoría del sistema',
    ]);
    await queryRunner.query(
      `INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
       SELECT r."id", p."id" FROM "roles" r, "permisos" p
       WHERE r."nombre" = 'Administrador' AND p."codigo" = $1`,
      [this.codigo],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "codigo" = $1)`,
      [this.codigo],
    );
    await queryRunner.query(`DELETE FROM "permisos" WHERE "codigo" = $1`, [this.codigo]);
    await queryRunner.query(`DROP TABLE "registros_auditoria"`);
    await queryRunner.query(`DROP TYPE "registros_auditoria_accion_enum"`);
  }
}
