import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permisos de FASE 16 (Inventario): Almacenes e Insumos siguen el patrón genérico
 * `.ver/.crear/.editar/.eliminar` (sin ejemplo propio en la sección 10 de CLAUDE.md);
 * Inventario usa exactamente `inventario.ver`/`inventario.ajustar`, tal como los da esa
 * sección. Recetas no tiene permisos propios: reutiliza `productos.ver`/`productos.editar`
 * (una receta es parte de la definición de un producto, ver receta.routes.ts).
 */
export class SeedPermisosInventario1788964740000 implements MigrationInterface {
  name = 'SeedPermisosInventario1788964740000';

  private readonly permisos = [
    ['almacenes.ver', 'Ver almacenes'],
    ['almacenes.crear', 'Crear almacenes'],
    ['almacenes.editar', 'Editar almacenes'],
    ['almacenes.eliminar', 'Eliminar almacenes'],
    ['insumos.ver', 'Ver insumos'],
    ['insumos.crear', 'Crear insumos'],
    ['insumos.editar', 'Editar insumos'],
    ['insumos.eliminar', 'Desactivar insumos'],
    ['inventario.ver', 'Ver el stock y el kardex de movimientos'],
    ['inventario.ajustar', 'Registrar compras y ajustes de stock'],
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
