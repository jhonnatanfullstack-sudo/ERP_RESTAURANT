import { MigrationInterface, QueryRunner } from 'typeorm';

export class PedidosTabla1788881359509 implements MigrationInterface {
  name = 'PedidosTabla1788881359509';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."pedidos_estado_enum" AS ENUM('abierto', 'cerrado', 'cancelado')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pedidos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "estado" "public"."pedidos_estado_enum" NOT NULL DEFAULT 'abierto', "total" numeric(10,2) NOT NULL DEFAULT '0', "notas" character varying(255), "fecha_cierre" TIMESTAMP WITH TIME ZONE, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "mesa_id" uuid NOT NULL, CONSTRAINT "PK_ebb5680ed29a24efdc586846725" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "detalle_pedidos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cantidad" smallint NOT NULL, "precio_unitario" numeric(10,2) NOT NULL, "subtotal" numeric(10,2) NOT NULL, "notas" character varying(255), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "pedido_id" uuid NOT NULL, "producto_id" uuid NOT NULL, CONSTRAINT "PK_89574e815e366720ce00fd1b31f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "pedidos" ADD CONSTRAINT "FK_ed48ccf11914571bc1c845e592d" FOREIGN KEY ("mesa_id") REFERENCES "mesas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_pedidos" ADD CONSTRAINT "FK_2720cdda307d262cfe40a2fce30" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_pedidos" ADD CONSTRAINT "FK_095863249e22548b6cd85dae392" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "detalle_pedidos" DROP CONSTRAINT "FK_095863249e22548b6cd85dae392"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_pedidos" DROP CONSTRAINT "FK_2720cdda307d262cfe40a2fce30"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pedidos" DROP CONSTRAINT "FK_ed48ccf11914571bc1c845e592d"`,
    );
    await queryRunner.query(`DROP TABLE "detalle_pedidos"`);
    await queryRunner.query(`DROP TABLE "pedidos"`);
    await queryRunner.query(`DROP TYPE "public"."pedidos_estado_enum"`);
  }
}
