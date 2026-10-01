import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * H16 — snapshot fiscal de Empresa/Cliente/tasa IGV en `ventas`, para que el XML UBL de la
 * primera emisión refleje los datos vigentes al momento de la VENTA, no los vigentes al
 * momento de la emisión (que puede ocurrir días o semanas después, por diseño — ver
 * `facturacion.service.ts`). Mismo patrón que `detalle_ventas` ya usa para congelar Producto
 * (`descripcion_producto`, `precio_unitario`, etc.): columnas propias, no JSON ni tabla
 * separada — tipado fuerte, sin JOIN adicional, y protegidas automáticamente por la misma
 * política RLS que ya rige `ventas`.
 *
 * `snapshot_fiscal_version` es el marcador explícito: `NULL` en toda fila existente antes de
 * esta migración ("legacy" — su dato histórico real ya no es reconstruible con certeza, así que
 * NO se hace backfill fingiendo que los datos actuales de Empresa/Cliente son los que había al
 * momento de esas ventas), `1` en toda venta creada a partir de este contrato (ver
 * `venta.service.ts: crearVenta`). Nunca se deriva legacy/H16 mirando si una columna snapshot es
 * `NULL`, porque varios campos son legítimamente opcionales incluso con el contrato completo
 * (`nombre_comercial`, `direccion_fiscal`, y todo el bloque de Cliente — una venta puede no
 * tener cliente identificado). El `CHECK` de abajo (revisión Codex, H16D-03) impide a nivel de
 * base de datos cualquier otro valor: el service de todas formas lo rechaza explícitamente
 * (fail-closed, no confía únicamente en este `CHECK`), pero un valor como `2` nunca debería
 * llegar a existir siquiera por error de escritura directa.
 *
 * `snapshot_tasa_igv` (revisión Codex, H16D-01) congela la tasa IGV EFECTIVA usada para
 * calcular `subtotal`/`igv`/`total` de esta venta y cada `detalle_ventas.igv` — nunca
 * `Empresa.acogidoRegimenMypeRestaurantes` (un booleano no basta para reconstruir el
 * `<cbc:Percent>` del XML sin volver a derivar la tasa desde la Empresa, que es justamente lo
 * que este snapshot existe para evitar). `numeric(5,4)` es suficiente para las dos tasas
 * realmente soportadas hoy (`0.1800`, `0.1050` — ver `igv.service.ts`) con margen para una
 * futura tasa adicional sin necesitar otra migración de tipo.
 *
 * El resto de los 10 campos (Empresa/Cliente) son exactamente los que `factura.builder.ts`
 * consume hoy de las relaciones vivas `empresa`/`cliente` — no se copia ninguna columna que el
 * XML actual no use (`email`, `telefono`, `direccion` de Cliente, objetos de país/distrito).
 */
export class SnapshotFiscalVenta1789018000000 implements MigrationInterface {
  name = 'SnapshotFiscalVenta1789018000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ventas"
        ADD COLUMN "snapshot_fiscal_version" smallint,
        ADD COLUMN "snapshot_empresa_ruc" varchar(11),
        ADD COLUMN "snapshot_empresa_razon_social" varchar(255),
        ADD COLUMN "snapshot_empresa_nombre_comercial" varchar(255),
        ADD COLUMN "snapshot_empresa_ubigeo" varchar(255),
        ADD COLUMN "snapshot_empresa_direccion_fiscal" varchar(255),
        ADD COLUMN "snapshot_cliente_tipo_documento_codigo" varchar(2),
        ADD COLUMN "snapshot_cliente_numero_documento" varchar(20),
        ADD COLUMN "snapshot_cliente_razon_social" varchar(255),
        ADD COLUMN "snapshot_cliente_nombres" varchar(150),
        ADD COLUMN "snapshot_cliente_apellidos" varchar(150),
        ADD COLUMN "snapshot_tasa_igv" numeric(5,4),
        ADD CONSTRAINT "CHK_ventas_snapshot_fiscal_version"
          CHECK ("snapshot_fiscal_version" IS NULL OR "snapshot_fiscal_version" = 1)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ventas"
        DROP CONSTRAINT IF EXISTS "CHK_ventas_snapshot_fiscal_version",
        DROP COLUMN IF EXISTS "snapshot_tasa_igv",
        DROP COLUMN IF EXISTS "snapshot_cliente_apellidos",
        DROP COLUMN IF EXISTS "snapshot_cliente_nombres",
        DROP COLUMN IF EXISTS "snapshot_cliente_razon_social",
        DROP COLUMN IF EXISTS "snapshot_cliente_numero_documento",
        DROP COLUMN IF EXISTS "snapshot_cliente_tipo_documento_codigo",
        DROP COLUMN IF EXISTS "snapshot_empresa_direccion_fiscal",
        DROP COLUMN IF EXISTS "snapshot_empresa_ubigeo",
        DROP COLUMN IF EXISTS "snapshot_empresa_nombre_comercial",
        DROP COLUMN IF EXISTS "snapshot_empresa_razon_social",
        DROP COLUMN IF EXISTS "snapshot_empresa_ruc",
        DROP COLUMN IF EXISTS "snapshot_fiscal_version"
    `);
  }
}
