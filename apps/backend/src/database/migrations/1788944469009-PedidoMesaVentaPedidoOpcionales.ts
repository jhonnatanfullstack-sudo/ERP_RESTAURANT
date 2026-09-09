import { MigrationInterface, QueryRunner } from 'typeorm';

export class PedidoMesaVentaPedidoOpcionales1788944469009 implements MigrationInterface {
  name = 'PedidoMesaVentaPedidoOpcionales1788944469009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pedido "para llevar": sin mesa asignada.
    await queryRunner.query(`ALTER TABLE "pedidos" ALTER COLUMN "mesa_id" DROP NOT NULL`);
    // Venta directa: sin pedido de origen. Postgres no considera iguales dos NULL en una
    // columna UNIQUE, así que el índice único existente sobre "pedido_id" sigue impidiendo
    // dos ventas del mismo pedido sin necesitar convertirlo en un índice parcial.
    await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "pedido_id" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir requiere que ya no existan pedidos "para llevar" ni ventas directas en la
    // tabla (o decidir qué mesa/pedido asignarles) — quien revierta debe resolver esos datos
    // primero; si quedan filas con NULL, este ALTER falla y avisa en vez de corromper datos.
    await queryRunner.query(`ALTER TABLE "ventas" ALTER COLUMN "pedido_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "pedidos" ALTER COLUMN "mesa_id" SET NOT NULL`);
  }
}
