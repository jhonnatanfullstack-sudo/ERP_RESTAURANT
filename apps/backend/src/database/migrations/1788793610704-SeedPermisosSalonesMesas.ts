import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega los permisos de los modulos Salones y Mesas (FASE 10) y se los
 * asigna al rol Administrador, siguiendo el mismo patron de
 * SeedPermisosCategorias.
 */
export class SeedPermisosSalonesMesas1788793610704 implements MigrationInterface {
  name = 'SeedPermisosSalonesMesas1788793610704';

  private readonly permisos = [
    ['salones.ver', 'Ver salones'],
    ['salones.crear', 'Crear salones'],
    ['salones.editar', 'Editar salones'],
    ['salones.eliminar', 'Eliminar salones'],
    ['mesas.ver', 'Ver mesas'],
    ['mesas.crear', 'Crear mesas'],
    ['mesas.editar', 'Editar mesas'],
    ['mesas.eliminar', 'Eliminar mesas'],
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
