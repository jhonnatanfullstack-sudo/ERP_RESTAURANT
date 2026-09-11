import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Créditos y cobranzas: catálogo de bancos, cronograma de cuotas de una venta al crédito y
 * los pagos que la van amortizando. Añade además el sustento bancario del cobro al contado
 * (`ventas.banco_id` / `numero_operacion`) y la marca `medios_pago.requiere_banco`.
 *
 * El saldo de una venta NO se guarda: se calcula sumando los pagos no anulados
 * (`cobranza.service.ts`), para que no pueda quedar desincronizado.
 */
export class CreditosYCobranzas1788993000000 implements MigrationInterface {
  name = 'CreditosYCobranzas1788993000000';

  /** Entidades financieras con su código SBS (el mismo del Catálogo N° 54 de SUNAT). */
  private readonly bancos = [
    ['002', 'Banco de Crédito del Perú (BCP)'],
    ['003', 'Interbank'],
    ['007', 'Citibank del Perú'],
    ['009', 'Scotiabank Perú'],
    ['011', 'BBVA Perú'],
    ['018', 'Banco de la Nación'],
    ['023', 'Banco de Comercio'],
    ['035', 'Banco Interamericano de Finanzas (BanBif)'],
    ['038', 'Banco Pichincha'],
    ['043', 'Banco Falabella'],
    ['049', 'Mibanco'],
    ['053', 'Banco Ripley'],
    ['054', 'Banco Santander Perú'],
    ['056', 'Banco Alfin'],
    ['058', 'Banco GNB Perú'],
    ['800', 'Otra entidad financiera'],
  ];

  /** Medios de pago que pasan por una entidad financiera y exigen banco + nº de operación. */
  private readonly mediosBancarizados = ['transferencia', 'deposito', 'cheque'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "bancos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "codigo" character varying(4) NOT NULL,
        "nombre" character varying(100) NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        CONSTRAINT "UQ_bancos_codigo" UNIQUE ("codigo"),
        CONSTRAINT "PK_bancos" PRIMARY KEY ("id")
      )`,
    );
    for (const [codigo, nombre] of this.bancos) {
      await queryRunner.query(`INSERT INTO "bancos" ("codigo", "nombre") VALUES ($1, $2)`, [
        codigo,
        nombre,
      ]);
    }

    // Medios de pago que faltaban para poder sustentar una cobranza bancarizada.
    await queryRunner.query(
      `ALTER TABLE "medios_pago" ADD "requiere_banco" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `INSERT INTO "medios_pago" ("codigo", "nombre") VALUES ('deposito', 'Depósito en cuenta'), ('cheque', 'Cheque')`,
    );
    await queryRunner.query(
      `UPDATE "medios_pago" SET "requiere_banco" = true WHERE "codigo" = ANY($1::text[])`,
      [this.mediosBancarizados],
    );

    await queryRunner.query(`ALTER TABLE "ventas" ADD "banco_id" uuid`);
    await queryRunner.query(`ALTER TABLE "ventas" ADD "numero_operacion" character varying(50)`);
    await queryRunner.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "FK_ventas_banco" FOREIGN KEY ("banco_id") REFERENCES "bancos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "cuotas_venta" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "numero" integer NOT NULL,
        "monto" numeric(10,2) NOT NULL,
        "fecha_vencimiento" date NOT NULL,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "venta_id" uuid NOT NULL,
        CONSTRAINT "CHK_cuota_monto_positivo" CHECK ("monto" > 0),
        CONSTRAINT "PK_cuotas_venta" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_una_cuota_por_numero_en_venta" ON "cuotas_venta" ("venta_id", "numero")`,
    );
    await queryRunner.query(
      `ALTER TABLE "cuotas_venta" ADD CONSTRAINT "FK_cuotas_venta_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "pagos_venta" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "fecha_pago" date NOT NULL,
        "monto" numeric(10,2) NOT NULL,
        "numero_operacion" character varying(50),
        "observacion" character varying(255),
        "anulado" boolean NOT NULL DEFAULT false,
        "motivo_anulacion" character varying(255),
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "venta_id" uuid NOT NULL,
        "medio_pago_id" uuid NOT NULL,
        "banco_id" uuid,
        "usuario_id" uuid NOT NULL,
        CONSTRAINT "CHK_pago_monto_positivo" CHECK ("monto" > 0),
        CONSTRAINT "PK_pagos_venta" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_pagos_venta_venta" ON "pagos_venta" ("venta_id")`);
    await queryRunner.query(
      `ALTER TABLE "pagos_venta" ADD CONSTRAINT "FK_pagos_venta_venta" FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_venta" ADD CONSTRAINT "FK_pagos_venta_medio_pago" FOREIGN KEY ("medio_pago_id") REFERENCES "medios_pago"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_venta" ADD CONSTRAINT "FK_pagos_venta_banco" FOREIGN KEY ("banco_id") REFERENCES "bancos"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "pagos_venta" ADD CONSTRAINT "FK_pagos_venta_usuario" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pagos_venta" DROP CONSTRAINT "FK_pagos_venta_usuario"`);
    await queryRunner.query(`ALTER TABLE "pagos_venta" DROP CONSTRAINT "FK_pagos_venta_banco"`);
    await queryRunner.query(
      `ALTER TABLE "pagos_venta" DROP CONSTRAINT "FK_pagos_venta_medio_pago"`,
    );
    await queryRunner.query(`ALTER TABLE "pagos_venta" DROP CONSTRAINT "FK_pagos_venta_venta"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_pagos_venta_venta"`);
    await queryRunner.query(`DROP TABLE "pagos_venta"`);

    await queryRunner.query(`ALTER TABLE "cuotas_venta" DROP CONSTRAINT "FK_cuotas_venta_venta"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_una_cuota_por_numero_en_venta"`);
    await queryRunner.query(`DROP TABLE "cuotas_venta"`);

    await queryRunner.query(`ALTER TABLE "ventas" DROP CONSTRAINT "FK_ventas_banco"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "numero_operacion"`);
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "banco_id"`);

    await queryRunner.query(`DELETE FROM "medios_pago" WHERE "codigo" IN ('deposito', 'cheque')`);
    await queryRunner.query(`ALTER TABLE "medios_pago" DROP COLUMN "requiere_banco"`);
    await queryRunner.query(`DROP TABLE "bancos"`);
  }
}
