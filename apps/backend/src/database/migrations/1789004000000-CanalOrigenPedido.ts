import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Autopedido por QR en mesa y delivery/recojo reales (antes solo existía un enlace de
 * WhatsApp que nunca creaba un `Pedido`, ver `docs/decisiones-tecnicas.md`). Un pedido público
 * sigue el mismo ciclo de vida que uno de salón —abierto, a la espera de que el staff lo envíe
 * a cocina— así que no hace falta un estado nuevo: alcanza con saber por dónde entró
 * (`canal_origen`) y, si no vino de una mesa, a quién y adónde llevarlo.
 */
export class CanalOrigenPedido1789004000000 implements MigrationInterface {
  name = 'CanalOrigenPedido1789004000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "pedidos_canal_origen_enum" AS ENUM ('salon', 'autopedido', 'delivery', 'recojo')`,
    );
    await queryRunner.query(
      `ALTER TABLE "pedidos" ADD COLUMN "canal_origen" "pedidos_canal_origen_enum" NOT NULL DEFAULT 'salon'`,
    );
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "contacto_nombre" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "contacto_telefono" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "pedidos" ADD COLUMN "direccion_entrega" varchar(255)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN IF EXISTS "direccion_entrega"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN IF EXISTS "contacto_telefono"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN IF EXISTS "contacto_nombre"`);
    await queryRunner.query(`ALTER TABLE "pedidos" DROP COLUMN IF EXISTS "canal_origen"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pedidos_canal_origen_enum"`);
  }
}
