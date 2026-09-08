import { MigrationInterface, QueryRunner } from 'typeorm';

export class ComandasTabla1788883059720 implements MigrationInterface {
  name = 'ComandasTabla1788883059720';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."comandas_estado_enum" AS ENUM('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelada')`,
    );
    await queryRunner.query(
      `CREATE TABLE "comandas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "estado" "public"."comandas_estado_enum" NOT NULL DEFAULT 'pendiente', "notas" character varying(255), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "pedido_id" uuid NOT NULL, CONSTRAINT "PK_f2a79c4679e1b8f6342d758f964" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "detalle_pedidos" ADD "comanda_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "comandas" ADD CONSTRAINT "FK_13cfffc52c5b6f016cd1eba302c" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_pedidos" ADD CONSTRAINT "FK_3e4d8ee1d3f6b174d27e3a0f92e" FOREIGN KEY ("comanda_id") REFERENCES "comandas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "detalle_pedidos" DROP CONSTRAINT "FK_3e4d8ee1d3f6b174d27e3a0f92e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comandas" DROP CONSTRAINT "FK_13cfffc52c5b6f016cd1eba302c"`,
    );
    await queryRunner.query(`ALTER TABLE "detalle_pedidos" DROP COLUMN "comanda_id"`);
    await queryRunner.query(`DROP TABLE "comandas"`);
    await queryRunner.query(`DROP TYPE "public"."comandas_estado_enum"`);
  }
}
