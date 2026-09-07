import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega los permisos ".eliminar" para usuarios, personal y roles,
 * siguiendo el catalogo de ejemplo de la seccion 10 de CLAUDE.md
 * (ver/crear/editar/eliminar), y se los asigna al rol Administrador.
 */
export class SeedPermisosEliminar1788772600457 implements MigrationInterface {
  name = 'SeedPermisosEliminar1788772600457';

  private readonly permisos = [
    ['usuarios.eliminar', 'Eliminar (desactivar) usuarios'],
    ['personal.eliminar', 'Eliminar (desactivar) personal'],
    ['roles.eliminar', 'Eliminar roles'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [codigo, descripcion] of this.permisos) {
      await queryRunner.query(`INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2)`, [
        codigo,
        descripcion,
      ]);
    }

    await queryRunner.query(
      `INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
       SELECT r."id", p."id"
       FROM "roles" r, "permisos" p
       WHERE r."nombre" = 'Administrador' AND p."codigo" = ANY($1::text[])`,
      [this.permisos.map(([codigo]) => codigo)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "codigo" = ANY($1::text[]))`,
      [this.permisos.map(([codigo]) => codigo)],
    );
    await queryRunner.query(`DELETE FROM "permisos" WHERE "codigo" = ANY($1::text[])`, [
      this.permisos.map(([codigo]) => codigo),
    ]);
  }
}
