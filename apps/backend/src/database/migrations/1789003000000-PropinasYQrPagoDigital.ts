import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pagos digitales locales (Yape/Plin): propina voluntaria en la venta y el QR estático de
 * cobro que el restaurante exhibe en caja. Habilitar la propina digital sube de 22% a 61% la
 * proporción de clientes que la deja (ver `docs/decisiones-tecnicas.md`), y el QR es la forma
 * más simple de aceptar Yape/Plin sin una afiliación de comercio (que exigiría credenciales de
 * un acuerdo comercial que este sistema no tiene).
 *
 * No hay comprobante ni catálogo nuevo: la propina es una columna de `ventas` que queda fuera
 * de `subtotal`/`igv`/`total` (no es parte de lo vendido, no paga IGV), y el QR es una imagen
 * más en `configuraciones`, mismo patrón que `productos.imagen_url`.
 */
export class PropinasYQrPagoDigital1789003000000 implements MigrationInterface {
  name = 'PropinasYQrPagoDigital1789003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD COLUMN "propina" numeric(10,2) NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "configuraciones" ADD COLUMN "qr_pago_yape" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "configuraciones" ADD COLUMN "qr_pago_plin" varchar(255)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "configuraciones" DROP COLUMN IF EXISTS "qr_pago_plin"`);
    await queryRunner.query(`ALTER TABLE "configuraciones" DROP COLUMN IF EXISTS "qr_pago_yape"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN IF EXISTS "propina"`);
  }
}
