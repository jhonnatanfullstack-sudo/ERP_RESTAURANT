import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permisos del módulo de Talonarios: al patrón genérico `.ver/.crear/.editar/.eliminar` se
 * suma `talonarios.asignar`, porque decidir qué cajero emite desde qué serie es una decisión
 * distinta de editar el talonario en sí.
 *
 * Emitir desde un talonario NO necesita ninguno de estos: se resuelve con `ventas.crear`
 * (ver `talonario.routes.ts`, endpoint `/mios`).
 */
export class SeedPermisosTalonarios1788992100000 implements MigrationInterface {
  name = 'SeedPermisosTalonarios1788992100000';

  private readonly permisos = [
    ['talonarios.ver', 'Ver talonarios'],
    ['talonarios.crear', 'Crear talonarios'],
    ['talonarios.editar', 'Editar talonarios'],
    ['talonarios.eliminar', 'Eliminar talonarios'],
    ['talonarios.asignar', 'Asignar usuarios a un talonario'],
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
