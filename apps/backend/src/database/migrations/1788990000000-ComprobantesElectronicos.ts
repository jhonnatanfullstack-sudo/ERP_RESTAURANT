import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla de comprobantes electrónicos (facturación SUNAT). Guarda el XML UBL 2.1 firmado tal
 * cual se envió y el CDR que SUNAT devolvió: ambos son documentos con valor legal y deben
 * conservarse íntegros, sin que una edición posterior de la venta los altere.
 *
 * Se separa de `ventas` porque su ciclo de vida es independiente: una venta registrada puede
 * quedar pendiente de envío, fallar por red y reintentarse, sin que eso toque la venta.
 */
export class ComprobantesElectronicos1788990000000 implements MigrationInterface {
  name = 'ComprobantesElectronicos1788990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "comprobantes_electronicos_estado_enum" AS ENUM (
        'pendiente', 'aceptado', 'observado', 'rechazado', 'error_envio'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "comprobantes_electronicos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "venta_id" uuid NOT NULL,
        "nombre_archivo" character varying(60) NOT NULL,
        "estado" "comprobantes_electronicos_estado_enum" NOT NULL DEFAULT 'pendiente',
        "xml_firmado" text NOT NULL,
        "hash_firma" character varying(100) NOT NULL,
        "cdr_xml" text,
        "codigo_respuesta" character varying(10),
        "mensaje_respuesta" character varying(500),
        "intentos" integer NOT NULL DEFAULT 0,
        "enviado_en" TIMESTAMP WITH TIME ZONE,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comprobantes_electronicos" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_comprobante_nombre_archivo" UNIQUE ("nombre_archivo"),
        CONSTRAINT "UQ_comprobante_venta" UNIQUE ("venta_id"),
        CONSTRAINT "FK_comprobante_venta" FOREIGN KEY ("venta_id")
          REFERENCES "ventas"("id") ON DELETE RESTRICT
      )
    `);

    // El envío por lotes busca los pendientes y los que fallaron: sin índice, ese barrido
    // recorre toda la tabla, que crece con cada venta del restaurante.
    await queryRunner.query(
      `CREATE INDEX "IDX_comprobante_estado" ON "comprobantes_electronicos" ("estado")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_comprobante_estado"`);
    await queryRunner.query(`DROP TABLE "comprobantes_electronicos"`);
    await queryRunner.query(`DROP TYPE "comprobantes_electronicos_estado_enum"`);
  }
}
