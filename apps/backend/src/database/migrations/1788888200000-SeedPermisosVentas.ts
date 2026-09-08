import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega los permisos del modulo Ventas (FASE 14) y se los asigna al rol
 * Administrador. Nombres tal como los da el ejemplo de la seccion 10 de
 * CLAUDE.md: ventas.ver / ventas.crear / ventas.anular (no ".eliminar").
 */
export class SeedPermisosVentas1788888200000 implements MigrationInterface {
  name = 'SeedPermisosVentas1788888200000';

  private readonly permisos = [
    ['ventas.ver', 'Ver ventas'],
    ['ventas.crear', 'Registrar una venta a partir de un pedido cerrado'],
    ['ventas.anular', 'Anular una venta emitida'],
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
