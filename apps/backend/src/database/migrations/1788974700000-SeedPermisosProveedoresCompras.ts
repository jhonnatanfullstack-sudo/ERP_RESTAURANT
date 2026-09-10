import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permisos de FASE 17 (Proveedores y compras): Proveedores sigue el patrón genérico
 * `.ver/.crear/.editar/.eliminar` (sin ejemplo propio en la sección 10 de CLAUDE.md); Compras
 * usa `.ver/.crear/.anular` — mismo criterio que Ventas: una compra registrada no se borra
 * (genera movimientos reales de stock), se anula con una reversa.
 */
export class SeedPermisosProveedoresCompras1788974700000 implements MigrationInterface {
  name = 'SeedPermisosProveedoresCompras1788974700000';

  private readonly permisos = [
    ['proveedores.ver', 'Ver proveedores'],
    ['proveedores.crear', 'Crear proveedores'],
    ['proveedores.editar', 'Editar proveedores'],
    ['proveedores.eliminar', 'Desactivar proveedores'],
    ['compras.ver', 'Ver compras'],
    ['compras.crear', 'Registrar una compra a un proveedor'],
    ['compras.anular', 'Anular una compra registrada'],
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
