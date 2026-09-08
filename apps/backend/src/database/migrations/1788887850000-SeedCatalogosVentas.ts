import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos semilla de los catálogos usados por Productos (Tipo de Afectación del IGV) y
 * Ventas (Tipo de Operación, Medios de Pago). Subconjunto de uso común, extensible después
 * sin tocar código — mismo criterio que SeedUnidadesMedida.
 */
export class SeedCatalogosVentas1788887850000 implements MigrationInterface {
  name = 'SeedCatalogosVentas1788887850000';

  private readonly tiposAfectacionIgv: Array<[string, string]> = [
    ['10', 'Gravado - Operación Onerosa'],
    ['20', 'Exonerado - Operación Onerosa'],
    ['30', 'Inafecto - Operación Onerosa'],
  ];

  private readonly tiposOperacion: Array<[string, string]> = [
    ['0101', 'Venta interna'],
    ['0200', 'Exportación de Bienes'],
    ['0201', 'Exportación de Servicios'],
  ];

  private readonly mediosPago: Array<[string, string]> = [
    ['efectivo', 'Efectivo'],
    ['tarjeta_credito', 'Tarjeta de crédito'],
    ['tarjeta_debito', 'Tarjeta de débito'],
    ['transferencia', 'Transferencia bancaria'],
    ['yape', 'Yape'],
    ['plin', 'Plin'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [codigo, nombre] of this.tiposAfectacionIgv) {
      await queryRunner.query(
        `INSERT INTO "tipos_afectacion_igv" ("codigo", "nombre") VALUES ($1, $2)`,
        [codigo, nombre],
      );
    }
    for (const [codigo, nombre] of this.tiposOperacion) {
      await queryRunner.query(
        `INSERT INTO "tipos_operacion" ("codigo", "nombre") VALUES ($1, $2)`,
        [codigo, nombre],
      );
    }
    for (const [codigo, nombre] of this.mediosPago) {
      await queryRunner.query(`INSERT INTO "medios_pago" ("codigo", "nombre") VALUES ($1, $2)`, [
        codigo,
        nombre,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "medios_pago" WHERE "codigo" = ANY($1::text[])`, [
      this.mediosPago.map(([codigo]) => codigo),
    ]);
    await queryRunner.query(`DELETE FROM "tipos_operacion" WHERE "codigo" = ANY($1::text[])`, [
      this.tiposOperacion.map(([codigo]) => codigo),
    ]);
    await queryRunner.query(`DELETE FROM "tipos_afectacion_igv" WHERE "codigo" = ANY($1::text[])`, [
      this.tiposAfectacionIgv.map(([codigo]) => codigo),
    ]);
  }
}
