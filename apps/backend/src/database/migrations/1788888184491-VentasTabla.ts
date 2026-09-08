import { MigrationInterface, QueryRunner } from 'typeorm';

export class VentasTabla1788888184491 implements MigrationInterface {
  name = 'VentasTabla1788888184491';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "FK_producto_tipo_afectacion_igv"`,
    );
    await queryRunner.query(
      `CREATE TABLE "detalle_ventas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "descripcion_producto" character varying(150) NOT NULL, "cantidad" smallint NOT NULL, "precio_unitario" numeric(10,2) NOT NULL, "valor_venta" numeric(10,2) NOT NULL, "igv" numeric(10,2) NOT NULL, "subtotal" numeric(10,2) NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "venta_id" uuid NOT NULL, "producto_id" uuid NOT NULL, "tipo_afectacion_igv_id" uuid NOT NULL, CONSTRAINT "PK_3f017a7ffaa120b5fad5990521d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ventas_forma_pago_enum" AS ENUM('contado', 'credito')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ventas_estado_enum" AS ENUM('emitida', 'anulada')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ventas" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "serie" character varying(4) NOT NULL, "numero" integer NOT NULL, "forma_pago" "public"."ventas_forma_pago_enum" NOT NULL DEFAULT 'contado', "subtotal" numeric(10,2) NOT NULL, "igv" numeric(10,2) NOT NULL, "total" numeric(10,2) NOT NULL, "estado" "public"."ventas_estado_enum" NOT NULL DEFAULT 'emitida', "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "pedido_id" uuid NOT NULL, "cliente_id" uuid, "tipo_comprobante_id" uuid NOT NULL, "tipo_operacion_id" uuid NOT NULL, "medio_pago_id" uuid, CONSTRAINT "PK_b8b73abe8561829c019531d9a2e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ccd39f54474500c745e6f92cb5" ON "ventas"  ("tipo_comprobante_id", "serie", "numero") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bb320dd25860311e9c8135c25e" ON "ventas"  ("pedido_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_e083a4d6645319df2d3e0e0bbc3" FOREIGN KEY ("tipo_afectacion_igv_id") REFERENCES "tipos_afectacion_igv"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_ventas" ADD CONSTRAINT "FK_ebfe4ddaa56d1a98410cb4b7f67" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_ventas" ADD CONSTRAINT "FK_41f061fb15d8454df77e5806478" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_ventas" ADD CONSTRAINT "FK_43e0d2d2d082feaf50676b5bd31" FOREIGN KEY ("tipo_afectacion_igv_id") REFERENCES "tipos_afectacion_igv"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_bb320dd25860311e9c8135c25ec" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_6a9b8170c731e6ca2449ea27c52" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_39c4d83f4a54ea9459bdb80a76c" FOREIGN KEY ("tipo_comprobante_id") REFERENCES "tipos_comprobante"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_32a1667cb7752ffe8c7e39c41ac" FOREIGN KEY ("tipo_operacion_id") REFERENCES "tipos_operacion"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_8c1955e1660af2f030e44b43e07" FOREIGN KEY ("medio_pago_id") REFERENCES "medios_pago"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ventas" DROP CONSTRAINT "FK_8c1955e1660af2f030e44b43e07"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" DROP CONSTRAINT "FK_32a1667cb7752ffe8c7e39c41ac"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" DROP CONSTRAINT "FK_39c4d83f4a54ea9459bdb80a76c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" DROP CONSTRAINT "FK_6a9b8170c731e6ca2449ea27c52"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ventas" DROP CONSTRAINT "FK_bb320dd25860311e9c8135c25ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_ventas" DROP CONSTRAINT "FK_43e0d2d2d082feaf50676b5bd31"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_ventas" DROP CONSTRAINT "FK_41f061fb15d8454df77e5806478"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_ventas" DROP CONSTRAINT "FK_ebfe4ddaa56d1a98410cb4b7f67"`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "FK_e083a4d6645319df2d3e0e0bbc3"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_bb320dd25860311e9c8135c25e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ccd39f54474500c745e6f92cb5"`);
    await queryRunner.query(`DROP TABLE "ventas"`);
    await queryRunner.query(`DROP TYPE "public"."ventas_estado_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ventas_forma_pago_enum"`);
    await queryRunner.query(`DROP TABLE "detalle_ventas"`);
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_producto_tipo_afectacion_igv" FOREIGN KEY ("tipo_afectacion_igv_id") REFERENCES "tipos_afectacion_igv"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}
