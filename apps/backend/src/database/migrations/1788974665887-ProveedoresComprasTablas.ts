import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProveedoresComprasTablas1788974665887 implements MigrationInterface {
  name = 'ProveedoresComprasTablas1788974665887';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "proveedores" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombres" character varying(150), "apellidos" character varying(150), "razon_social" character varying(255), "numero_documento" character varying(20) NOT NULL, "telefono" character varying(20), "email" character varying(150), "direccion" character varying(255), "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tipo_documento_identidad_id" uuid NOT NULL, CONSTRAINT "PK_1dcf121f19f362fb1b4c0a493a9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e625eb15d65188cd3da1c2a904" ON "proveedores"  ("tipo_documento_identidad_id", "numero_documento") `,
    );
    await queryRunner.query(
      `CREATE TABLE "detalle_compras" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "descripcion_item" character varying(150) NOT NULL, "cantidad" numeric(10,3) NOT NULL, "costo_unitario" numeric(10,2) NOT NULL, "valor_compra" numeric(10,2) NOT NULL, "igv" numeric(10,2) NOT NULL, "subtotal" numeric(10,2) NOT NULL, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "compra_id" uuid NOT NULL, "insumo_id" uuid, "producto_id" uuid, "tipo_afectacion_igv_id" uuid NOT NULL, CONSTRAINT "CHK_detalle_compra_item_exclusivo" CHECK ((insumo_id IS NULL) != (producto_id IS NULL)), CONSTRAINT "PK_72aa0fd4a67a53cb705c698acad" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."compras_estado_enum" AS ENUM('registrada', 'anulada')`,
    );
    await queryRunner.query(
      `CREATE TABLE "compras" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "serie" character varying(20), "numero" character varying(20), "fecha_emision" date NOT NULL, "subtotal" numeric(10,2) NOT NULL, "igv" numeric(10,2) NOT NULL, "total" numeric(10,2) NOT NULL, "estado" "public"."compras_estado_enum" NOT NULL DEFAULT 'registrada', "observacion" character varying(255), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "proveedor_id" uuid NOT NULL, "almacen_id" uuid NOT NULL, "tipo_comprobante_id" uuid, "usuario_id" uuid NOT NULL, CONSTRAINT "PK_63037d5249eefe140e3587ff6f2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "existencias" ADD "compra_id" uuid`);
    await queryRunner.query(
      `ALTER TYPE "public"."existencias_tipo_enum" ADD VALUE 'anulacion_compra'`,
    );
    await queryRunner.query(
      `ALTER TABLE "proveedores" ADD CONSTRAINT "FK_1c0e3ee80a45f5a684461b5af7b" FOREIGN KEY ("tipo_documento_identidad_id") REFERENCES "tipos_documento_identidad"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_compras" ADD CONSTRAINT "FK_3fc9670dcddd10affeb865a18ed" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_compras" ADD CONSTRAINT "FK_db68f712589c20a2544bca63c46" FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_compras" ADD CONSTRAINT "FK_ab97fc85e622965fef77ba3a617" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_compras" ADD CONSTRAINT "FK_dd0256e38f99fb4dd0b81b4ef1f" FOREIGN KEY ("tipo_afectacion_igv_id") REFERENCES "tipos_afectacion_igv"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" ADD CONSTRAINT "FK_d7b3950fea313d15e46e0c59286" FOREIGN KEY ("proveedor_id") REFERENCES "proveedores"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" ADD CONSTRAINT "FK_69287128146857f559f0323dd10" FOREIGN KEY ("almacen_id") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" ADD CONSTRAINT "FK_c09c5460cc3fe80614739784f81" FOREIGN KEY ("tipo_comprobante_id") REFERENCES "tipos_comprobante"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" ADD CONSTRAINT "FK_ec0332a11c8fa9c4330aaca0aea" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" ADD CONSTRAINT "FK_1343114eeeca8d2a691082b71d6" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "existencias" DROP CONSTRAINT "FK_1343114eeeca8d2a691082b71d6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" DROP CONSTRAINT "FK_ec0332a11c8fa9c4330aaca0aea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" DROP CONSTRAINT "FK_c09c5460cc3fe80614739784f81"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" DROP CONSTRAINT "FK_69287128146857f559f0323dd10"`,
    );
    await queryRunner.query(
      `ALTER TABLE "compras" DROP CONSTRAINT "FK_d7b3950fea313d15e46e0c59286"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_compras" DROP CONSTRAINT "FK_dd0256e38f99fb4dd0b81b4ef1f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_compras" DROP CONSTRAINT "FK_ab97fc85e622965fef77ba3a617"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_compras" DROP CONSTRAINT "FK_db68f712589c20a2544bca63c46"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_compras" DROP CONSTRAINT "FK_3fc9670dcddd10affeb865a18ed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "proveedores" DROP CONSTRAINT "FK_1c0e3ee80a45f5a684461b5af7b"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."existencias_tipo_enum_old" AS ENUM('inicial', 'compra', 'ajuste_entrada', 'ajuste_salida', 'consumo_cocina', 'venta_directa')`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" ALTER COLUMN "tipo" TYPE "public"."existencias_tipo_enum_old" USING "tipo"::"text"::"public"."existencias_tipo_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."existencias_tipo_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."existencias_tipo_enum_old" RENAME TO "existencias_tipo_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "existencias" DROP COLUMN "compra_id"`);
    await queryRunner.query(`DROP TABLE "compras"`);
    await queryRunner.query(`DROP TYPE "public"."compras_estado_enum"`);
    await queryRunner.query(`DROP TABLE "detalle_compras"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e625eb15d65188cd3da1c2a904"`);
    await queryRunner.query(`DROP TABLE "proveedores"`);
  }
}
