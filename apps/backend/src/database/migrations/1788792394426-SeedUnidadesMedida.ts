import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos semilla del Catálogo SUNAT N° 03 - Unidades de Medida Comercial
 * (subconjunto de uso común en un restaurante: para productos y, más
 * adelante, para las cantidades de insumos en recetas).
 */
export class SeedUnidadesMedida1788792394426 implements MigrationInterface {
  name = 'SeedUnidadesMedida1788792394426';

  private readonly unidades: Array<[string, string]> = [
    ['NIU', 'Unidad'],
    ['KGM', 'Kilogramo'],
    ['GRM', 'Gramo'],
    ['LTR', 'Litro'],
    ['MLT', 'Mililitro'],
    ['PK', 'Paquete'],
    ['BX', 'Caja'],
    ['ZZ', 'Servicio'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [codigo, nombre] of this.unidades) {
      await queryRunner.query(
        `INSERT INTO "unidades_medida" ("codigo", "nombre") VALUES ($1, $2)`,
        [codigo, nombre],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "unidades_medida" WHERE "codigo" = ANY($1::text[])`, [
      this.unidades.map(([codigo]) => codigo),
    ]);
  }
}
