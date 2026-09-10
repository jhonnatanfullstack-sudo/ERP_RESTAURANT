import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un comprobante de proveedor puede traer sus precios con IGV incluido (lo usual) o como
 * valor de compra puro con el IGV sumado aparte al total — hasta ahora `calcularLineaCompra`
 * asumía siempre lo primero. `incluye_igv` (default true, para no alterar el cálculo de las
 * compras ya registradas) permite elegirlo al registrar/editar una compra.
 */
export class CompraIncluyeIgv1788982000000 implements MigrationInterface {
  name = 'CompraIncluyeIgv1788982000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "compras" ADD COLUMN "incluye_igv" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "compras" DROP COLUMN "incluye_igv"`);
  }
}
