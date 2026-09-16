import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Clientes Varios" / "Proveedores Varios" son registros por empresa desde que el sistema es
 * multi-empresa — pero la migración original que los sembró (`SeedProveedorClienteVarios`,
 * 2026-09) corrió **antes** de `MultiEmpresa` y solo insertó una fila cada uno, que el backfill
 * de esa fase le asignó a la única empresa que existía entonces. Cualquier empresa registrada
 * después (FASE 26 en adelante) quedó sin los suyos, así que `BuscadorCliente`/
 * `BuscadorProveedor` no tenían nada que preseleccionar — el placeholder simplemente no
 * aparecía. Este backfill le da uno a cada empresa que todavía no lo tiene, con el mismo DNI
 * reservado `99999999` que ya usan ambos componentes como ancla.
 *
 * `registrarDemo` (`demo.service.ts`) se actualiza aparte para que toda empresa nueva ya nazca
 * con los suyos, sin depender de otro backfill futuro.
 */
export class ClienteProveedorVariosPorEmpresa1789000900000 implements MigrationInterface {
  name = 'ClienteProveedorVariosPorEmpresa1789000900000';

  private readonly numeroDocumento = '99999999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [tipoDni] = await queryRunner.query(
      `SELECT "id" FROM "tipos_documento_identidad" WHERE "codigo" = '1'`,
    );

    await queryRunner.query(
      `INSERT INTO "clientes" ("empresa_id", "nombres", "tipo_documento_identidad_id", "numero_documento")
       SELECT e."id", 'Clientes Varios', $1::uuid, $2::varchar
         FROM "empresas" e
        WHERE NOT EXISTS (
          SELECT 1 FROM "clientes" c
           WHERE c."empresa_id" = e."id" AND c."numero_documento" = $2::varchar
        )`,
      [tipoDni.id, this.numeroDocumento],
    );

    await queryRunner.query(
      `INSERT INTO "proveedores" ("empresa_id", "nombres", "tipo_documento_identidad_id", "numero_documento")
       SELECT e."id", 'Proveedores Varios', $1::uuid, $2::varchar
         FROM "empresas" e
        WHERE NOT EXISTS (
          SELECT 1 FROM "proveedores" p
           WHERE p."empresa_id" = e."id" AND p."numero_documento" = $2::varchar
        )`,
      [tipoDni.id, this.numeroDocumento],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Mismo criterio que la migración original: borra por patrón. Si alguno ya se usó en una
    // venta/pedido/compra, la FK ON DELETE RESTRICT hace fallar el down a propósito — no hay
    // forma segura de deshacer un backfill de datos que ya está en uso.
    await queryRunner.query(
      `DELETE FROM "clientes" WHERE "numero_documento" = $1 AND "nombres" = 'Clientes Varios'`,
      [this.numeroDocumento],
    );
    await queryRunner.query(
      `DELETE FROM "proveedores" WHERE "numero_documento" = $1 AND "nombres" = 'Proveedores Varios'`,
      [this.numeroDocumento],
    );
  }
}
