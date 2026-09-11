import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permiso del módulo de Costos y márgenes (FASE 18). Es un solo permiso de lectura — el
 * costeo no crea ni modifica nada, se deriva de recetas y compras ya registradas — pero
 * expone cuánto gana el negocio por plato, así que no se abre a cualquier rol: se otorga
 * solo a Administrador, igual que `reportes.ver`.
 *
 * Es distinto de `productos.ver`/`productos.editar` (que gobiernan la receta en sí): quién
 * define qué lleva un platillo no es necesariamente quién puede ver su margen.
 */
export class SeedPermisoCostos1788994000000 implements MigrationInterface {
  name = 'SeedPermisoCostos1788994000000';

  private readonly codigo = 'costos.ver';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2)`, [
      this.codigo,
      'Ver el costo y el margen de los productos',
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
