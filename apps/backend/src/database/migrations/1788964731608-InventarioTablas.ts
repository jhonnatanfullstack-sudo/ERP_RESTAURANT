import { MigrationInterface, QueryRunner } from 'typeorm';

export class InventarioTablas1788964731608 implements MigrationInterface {
  name = 'InventarioTablas1788964731608';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "almacenes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(100) NOT NULL, "direccion" character varying(255), "es_principal" boolean NOT NULL DEFAULT false, "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "empresa_id" uuid NOT NULL, CONSTRAINT "PK_2af9818dc2019bc97c7d26217e1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_un_almacen_principal_por_empresa" ON "almacenes"  ("empresa_id") WHERE "es_principal" = true`,
    );
    await queryRunner.query(
      `CREATE TABLE "insumos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(150) NOT NULL, "descripcion" character varying(500), "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "unidad_medida_id" uuid NOT NULL, CONSTRAINT "UQ_0d28ae68a8f742beb176aa51ae0" UNIQUE ("nombre"), CONSTRAINT "PK_b4e1b727a7b140e698e3a3dc7af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "receta_insumos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "cantidad" numeric(10,3) NOT NULL, "producto_id" uuid NOT NULL, "insumo_id" uuid NOT NULL, CONSTRAINT "PK_4b98539953b6239117317c26431" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c54d914d2061919636b5b7cf47" ON "receta_insumos"  ("producto_id", "insumo_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."existencias_tipo_enum" AS ENUM('inicial', 'compra', 'ajuste_entrada', 'ajuste_salida', 'consumo_cocina', 'venta_directa')`,
    );
    await queryRunner.query(
      `CREATE TABLE "existencias" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tipo" "public"."existencias_tipo_enum" NOT NULL, "cantidad" numeric(10,3) NOT NULL, "costo_unitario" numeric(10,2), "observacion" character varying(255), "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "almacen_id" uuid NOT NULL, "insumo_id" uuid, "producto_id" uuid, "comanda_id" uuid, "venta_id" uuid, "usuario_id" uuid, CONSTRAINT "CHK_existencia_item_exclusivo" CHECK ((insumo_id IS NULL) != (producto_id IS NULL)), CONSTRAINT "PK_fb68f342dbc431adccba3b6100a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."productos_tipo_enum" AS ENUM('mercaderia', 'servicio')`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD "tipo" "public"."productos_tipo_enum" NOT NULL DEFAULT 'servicio'`,
    );
    await queryRunner.query(
      `ALTER TABLE "almacenes" ADD CONSTRAINT "FK_93676de0e171a0e8d112cfcadb8" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "insumos" ADD CONSTRAINT "FK_470e197e70d9023189b5ad9e3e8" FOREIGN KEY ("unidad_medida_id") REFERENCES "unidades_medida"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receta_insumos" ADD CONSTRAINT "FK_01c91a7e79b8a95efb087daa904" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "receta_insumos" ADD CONSTRAINT "FK_11a5d1a6e178e3fc39bfa902ad5" FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" ADD CONSTRAINT "FK_32b1d225d53049557d9c2c686f6" FOREIGN KEY ("almacen_id") REFERENCES "almacenes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" ADD CONSTRAINT "FK_a3ffb6fcdfbcd711607d739398e" FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" ADD CONSTRAINT "FK_98bb52545f3949216e8dd873af0" FOREIGN KEY ("producto_id") REFERENCES "productos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" ADD CONSTRAINT "FK_b4bf235c5e657c93b671711afe9" FOREIGN KEY ("comanda_id") REFERENCES "comandas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" ADD CONSTRAINT "FK_7e831aedb4595f74d6783f88d5d" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" ADD CONSTRAINT "FK_596e054669d4f94f1f23793ecb7" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "existencias" DROP CONSTRAINT "FK_596e054669d4f94f1f23793ecb7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" DROP CONSTRAINT "FK_7e831aedb4595f74d6783f88d5d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" DROP CONSTRAINT "FK_b4bf235c5e657c93b671711afe9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" DROP CONSTRAINT "FK_98bb52545f3949216e8dd873af0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" DROP CONSTRAINT "FK_a3ffb6fcdfbcd711607d739398e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "existencias" DROP CONSTRAINT "FK_32b1d225d53049557d9c2c686f6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receta_insumos" DROP CONSTRAINT "FK_11a5d1a6e178e3fc39bfa902ad5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "receta_insumos" DROP CONSTRAINT "FK_01c91a7e79b8a95efb087daa904"`,
    );
    await queryRunner.query(
      `ALTER TABLE "insumos" DROP CONSTRAINT "FK_470e197e70d9023189b5ad9e3e8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "almacenes" DROP CONSTRAINT "FK_93676de0e171a0e8d112cfcadb8"`,
    );
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN "tipo"`);
    await queryRunner.query(`DROP TYPE "public"."productos_tipo_enum"`);
    await queryRunner.query(`DROP TABLE "existencias"`);
    await queryRunner.query(`DROP TYPE "public"."existencias_tipo_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c54d914d2061919636b5b7cf47"`);
    await queryRunner.query(`DROP TABLE "receta_insumos"`);
    await queryRunner.query(`DROP TABLE "insumos"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_un_almacen_principal_por_empresa"`);
    await queryRunner.query(`DROP TABLE "almacenes"`);
  }
}
