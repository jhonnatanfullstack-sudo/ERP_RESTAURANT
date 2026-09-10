import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Proveedor y cliente "genéricos" para el caso frecuente en que no vale la pena registrar a
 * la contraparte real (compras menores sin comprobante, ventas al público en general): el
 * frontend los preselecciona automáticamente en Compras/Ventas/Pedidos (ver `BuscadorProveedor`
 * y `BuscadorCliente`), pero el operador siempre puede quitarlos y buscar/registrar al real.
 * DNI "99999999" es un valor reservado — no corresponde a una persona real — que ambos
 * componentes usan como ancla para encontrar estos registros sin depender de su UUID.
 */
export class SeedProveedorClienteVarios1788980000000 implements MigrationInterface {
  name = 'SeedProveedorClienteVarios1788980000000';

  private readonly numeroDocumento = '99999999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [tipoDni] = await queryRunner.query(
      `SELECT "id" FROM "tipos_documento_identidad" WHERE "codigo" = '1'`,
    );

    await queryRunner.query(
      `INSERT INTO "proveedores"
         ("nombres", "tipo_documento_identidad_id", "numero_documento")
       VALUES ($1, $2, $3)`,
      ['Proveedores Varios', tipoDni.id, this.numeroDocumento],
    );

    await queryRunner.query(
      `INSERT INTO "clientes"
         ("nombres", "tipo_documento_identidad_id", "numero_documento")
       VALUES ($1, $2, $3)`,
      ['Clientes Varios', tipoDni.id, this.numeroDocumento],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "proveedores" WHERE "numero_documento" = $1 AND "nombres" = 'Proveedores Varios'`,
      [this.numeroDocumento],
    );
    await queryRunner.query(
      `DELETE FROM "clientes" WHERE "numero_documento" = $1 AND "nombres" = 'Clientes Varios'`,
      [this.numeroDocumento],
    );
  }
}
