import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renombra el índice único de `ventas (tipo_comprobante_id, serie, numero)` de su nombre
 * autogenerado por TypeORM a uno explícito.
 *
 * No es cosmético: `venta.service.ts` distingue por el nombre de la constraint una colisión de
 * correlativo (que se reintenta con el siguiente número libre) de cualquier otra violación de
 * unicidad de la tabla — por ejemplo la de `pedido_id`, que significa algo muy distinto ("este
 * pedido ya tiene una venta") y no debe reintentarse.
 */
export class NombrarIndiceCorrelativoVentas1788992200000 implements MigrationInterface {
  name = 'NombrarIndiceCorrelativoVentas1788992200000';

  private readonly nombreViejo = 'IDX_ccd39f54474500c745e6f92cb5';
  private readonly nombreNuevo = 'IDX_un_correlativo_por_serie';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `IF EXISTS` porque en una base creada desde cero por TypeORM el nombre autogenerado
    // podría diferir; el bloque de abajo lo resuelve por columnas en ese caso.
    const [existente] = (await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'ventas' AND indexdef LIKE '%(tipo_comprobante_id, serie, numero)%'`,
    )) as { indexname: string }[];

    if (existente && existente.indexname !== this.nombreNuevo) {
      await queryRunner.query(
        `ALTER INDEX "${existente.indexname}" RENAME TO "${this.nombreNuevo}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER INDEX IF EXISTS "${this.nombreNuevo}" RENAME TO "${this.nombreViejo}"`,
    );
  }
}
