import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Preferencia de pago que el propio cliente indica al armar un pedido público (recojo,
 * delivery o autopedido en mesa) — ver `pedido.dto.ts: crearPedidoPublicoSchema`. No es un
 * cobro real ni reemplaza a `medios_pago`/Caja (eso sigue pasando cuando el staff cierra el
 * pedido); es solo lo que el cliente dice que va a usar, para que quien lo atienda no tenga
 * que preguntarlo de nuevo por chat. `vuelto_para` solo tiene sentido con 'efectivo'.
 */
export class MedioPagoPreferidoPedido1789011000000 implements MigrationInterface {
  name = 'MedioPagoPreferidoPedido1789011000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "pedidos_medio_pago_preferido_enum" AS ENUM ('efectivo', 'yape', 'plin', 'tarjeta')`,
    );
    await queryRunner.query(
      `ALTER TABLE "pedidos" ADD COLUMN "medio_pago_preferido" "pedidos_medio_pago_preferido_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "vuelto_para" numeric(10,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN IF EXISTS "vuelto_para"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN IF EXISTS "medio_pago_preferido"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pedidos_medio_pago_preferido_enum"`);
  }
}
