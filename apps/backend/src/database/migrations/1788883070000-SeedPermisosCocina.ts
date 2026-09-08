import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega los permisos del modulo Cocina/Comandas (FASE 13) y se los asigna
 * al rol Administrador, siguiendo el mismo patron de SeedPermisosPedidos.
 */
export class SeedPermisosCocina1788883070000 implements MigrationInterface {
  name = 'SeedPermisosCocina1788883070000';

  private readonly permisos = [
    ['cocina.ver', 'Ver la cola de comandas de cocina'],
    ['cocina.editar', 'Avanzar el estado de una comanda (en preparación, listo, entregado)'],
    ['cocina.eliminar', 'Cancelar una comanda pendiente'],
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
