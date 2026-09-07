import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos semilla de catálogos oficiales SUNAT.
 * - Catálogo N° 06: Tipo de Documento de Identidad (subconjunto de uso común).
 * - Catálogo N° 01: Tipo de Comprobante de Pago (subconjunto de uso común).
 * Ambos catálogos son extensibles: se pueden agregar más códigos con una
 * migración posterior sin afectar el esquema.
 */
export class SeedCatalogosSunat1788761401850 implements MigrationInterface {
  name = 'SeedCatalogosSunat1788761401850';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "tipos_documento_identidad" ("codigo", "nombre") VALUES
      ('0', 'Sin documento'),
      ('1', 'Documento Nacional de Identidad'),
      ('4', 'Carné de Extranjería'),
      ('6', 'Registro Único de Contribuyentes'),
      ('7', 'Pasaporte')
    `);

    await queryRunner.query(`
      INSERT INTO "tipos_comprobante" ("codigo", "nombre") VALUES
      ('01', 'Factura'),
      ('03', 'Boleta de Venta'),
      ('07', 'Nota de Crédito'),
      ('08', 'Nota de Débito'),
      ('09', 'Guía de Remisión - Remitente')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "tipos_comprobante" WHERE "codigo" IN ('01','03','07','08','09')`,
    );
    await queryRunner.query(
      `DELETE FROM "tipos_documento_identidad" WHERE "codigo" IN ('0','1','4','6','7')`,
    );
  }
}
