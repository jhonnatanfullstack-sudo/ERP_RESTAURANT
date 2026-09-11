import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permisos de Cobranzas (documentos por cobrar de las ventas al crédito). No usa el patrón
 * `.crear/.editar/.eliminar`: un cobro no se edita ni se borra — se registra y, si se
 * equivocaron, se anula dejando el motivo. Mismo criterio que Ventas y Compras.
 */
export class SeedPermisosCobranzas1788993100000 implements MigrationInterface {
  name = 'SeedPermisosCobranzas1788993100000';

  private readonly permisos = [
    ['cobranzas.ver', 'Ver cuentas por cobrar y sus pagos'],
    ['cobranzas.registrar', 'Registrar el pago de una venta al crédito'],
    ['cobranzas.anular', 'Anular un pago mal registrado'],
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
