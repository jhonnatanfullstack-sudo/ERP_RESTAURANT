import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permiso del módulo de Reportes (FASE 19). Es un solo permiso de lectura: los reportes no
 * crean ni modifican nada, solo agregan datos que ya existen — pero sí exponen el total
 * vendido y el ranking de clientes, así que no puede quedar abierto a cualquier rol.
 */
export class SeedPermisoReportes1788983000000 implements MigrationInterface {
  name = 'SeedPermisoReportes1788983000000';

  private readonly codigo = 'reportes.ver';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2)`, [
      this.codigo,
      'Ver reportes y analítica del negocio',
    ]);

    await queryRunner.query(
      `INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
       SELECT r."id", p."id"
       FROM "roles" r, "permisos" p
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
  }
}
