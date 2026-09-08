import { MigrationInterface, QueryRunner } from 'typeorm';

export class PedidoCliente1788886937946 implements MigrationInterface {
  name = 'PedidoCliente1788886937946';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pedidos" ADD "cliente_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "pedidos" ADD CONSTRAINT "FK_2fc639de84f845569ac2c9f78aa" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pedidos" DROP CONSTRAINT "FK_2fc639de84f845569ac2c9f78aa"`,
    );
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN "cliente_id"`);
  }
}
