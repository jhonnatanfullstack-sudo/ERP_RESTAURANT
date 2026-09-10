import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permiso para `PUT /api/compras/:id`: se agrega aparte de `SeedPermisosProveedoresCompras`
 * porque ese seed asumía (a propósito) que una compra no se edita, solo se anula — decisión
 * revisada: ahora sí se permite editar cabecera e ítems, reversando y recreando sus
 * movimientos de kardex dentro de una transacción (ver `compra.service.ts: actualizarCompra`).
 */
export class SeedPermisoComprasEditar1788981000000 implements MigrationInterface {
  name = 'SeedPermisoComprasEditar1788981000000';

  private readonly codigo = 'compras.editar';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2)`, [
      this.codigo,
      'Editar una compra registrada',
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
