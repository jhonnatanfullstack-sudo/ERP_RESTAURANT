import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convierte el sistema de mono-empresa a multi-empresa (FASE 25).
 *
 * Hasta aquí el sistema asumía un solo restaurante: solo `almacenes`, `personal` y
 * `talonarios` tenían `empresa_id`, y varias restricciones eran únicas **globalmente** — lo
 * que directamente impedía que dos empresas convivieran (dos restaurantes no podían llamar
 * "Bebidas" a una categoría, ni tener el mismo cliente, ni tener caja abierta a la vez, ni
 * usar ambos la serie `B001`).
 *
 * Esta migración: (1) agrega `empresa_id` a las 27 tablas de negocio que faltaban, (2) hace
 * el backfill contra la única empresa existente, y (3) reemplaza las restricciones únicas
 * globales por su equivalente por empresa. Las políticas RLS que hacen cumplir el
 * aislamiento van en la migración siguiente.
 */
export class MultiEmpresa1789000000000 implements MigrationInterface {
  name = 'MultiEmpresa1789000000000';

  /** Tablas de negocio que pasan a tener `empresa_id`. Las hijas (`detalle_*`,
   * `movimientos_caja`, `cuotas_venta`…) lo llevan igual aunque podrían deducirlo de su
   * padre: es desnormalización deliberada, porque una política RLS que tenga que salir a
   * buscar el `empresa_id` del padre con un `EXISTS` es más lenta y mucho más fácil de
   * escribir mal. Con la columna en cada tabla, la política es la misma línea en todas. */
  private readonly tablas = [
    'categorias',
    'marcas',
    'productos',
    'salones',
    'mesas',
    'clientes',
    'reservas',
    'pedidos',
    'detalle_pedidos',
    'comandas',
    'ventas',
    'detalle_ventas',
    'cajas',
    'movimientos_caja',
    'insumos',
    'receta_insumos',
    'existencias',
    'proveedores',
    'compras',
    'detalle_compras',
    'comprobantes_electronicos',
    'registros_auditoria',
    'cuotas_venta',
    'pagos_venta',
    'roles',
    'usuarios',
    'talonario_usuarios',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- 1. Campos de tenant y suscripción en la propia empresa -------------------------
    await queryRunner.query(`
      CREATE TYPE "empresas_plan_enum" AS ENUM ('demo', 'activo')
    `);
    await queryRunner.query(`
      ALTER TABLE "empresas"
        ADD COLUMN "slug" varchar(60),
        ADD COLUMN "plan" "empresas_plan_enum" NOT NULL DEFAULT 'demo',
        ADD COLUMN "demo_expira_en" timestamptz,
        ADD COLUMN "suspendida" boolean NOT NULL DEFAULT false,
        ADD COLUMN "creada_por_autoservicio" boolean NOT NULL DEFAULT false
    `);

    // La empresa que ya existía es el cliente real, no una demo: queda como cuenta activa
    // sin vencimiento. Su slug sale del RUC para garantizar unicidad sin adivinar un nombre.
    await queryRunner.query(`
      UPDATE "empresas"
         SET "slug" = 'empresa-' || "ruc",
             "plan" = 'activo'
       WHERE "slug" IS NULL
    `);
    await queryRunner.query(`ALTER TABLE "empresas" ALTER COLUMN "slug" SET NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_empresas_slug" ON "empresas" ("slug")`);

    // --- 2. `empresa_id` en cada tabla de negocio ---------------------------------------
    const empresaPorDefecto = `(SELECT "id" FROM "empresas" ORDER BY "creado_en" ASC LIMIT 1)`;

    for (const tabla of this.tablas) {
      await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "empresa_id" uuid`);
      await queryRunner.query(
        `UPDATE "${tabla}" SET "empresa_id" = ${empresaPorDefecto} WHERE "empresa_id" IS NULL`,
      );
      // Si esto falla es porque quedaron filas sin empresa que asignar (una base sin
      // ninguna empresa creada pero con datos). Es correcto que reviente: seguir dejaría
      // filas sin dueño, que es justo lo que el aislamiento no puede permitirse.
      await queryRunner.query(`ALTER TABLE "${tabla}" ALTER COLUMN "empresa_id" SET NOT NULL`);
      await queryRunner.query(`
        ALTER TABLE "${tabla}"
          ADD CONSTRAINT "FK_${tabla}_empresa"
          FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE CASCADE
      `);
      await queryRunner.query(`CREATE INDEX "IDX_${tabla}_empresa" ON "${tabla}" ("empresa_id")`);

      // Valor por defecto tomado del contexto de la petición. Cubre las escrituras que no
      // pasan por el repositorio de TypeORM (SQL crudo) y hace imposible insertar una fila
      // sin dueño por descuido: si no hay contexto, el default es NULL y el NOT NULL la
      // rechaza.
      await queryRunner.query(`
        ALTER TABLE "${tabla}"
          ALTER COLUMN "empresa_id"
          SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid
      `);
    }

    // --- 3. Restricciones únicas: de globales a por empresa -----------------------------
    const unicosPorNombre: Array<[string, string]> = [
      ['categorias', 'UQ_ccdf6cd1a34ea90a7233325063d'],
      ['marcas', 'UQ_29f5713899c32a96a8900143c6f'],
      ['salones', 'UQ_22f300f5acac0288304a41c3260'],
      ['insumos', 'UQ_0d28ae68a8f742beb176aa51ae0'],
      ['roles', 'UQ_a5be7aa67e759e347b1c6464e10'],
    ];
    for (const [tabla, restriccion] of unicosPorNombre) {
      await queryRunner.query(`ALTER TABLE "${tabla}" DROP CONSTRAINT IF EXISTS "${restriccion}"`);
      await queryRunner.query(
        `CREATE UNIQUE INDEX "UQ_${tabla}_empresa_nombre" ON "${tabla}" ("empresa_id", "nombre")`,
      );
    }

    // Documento de identidad: la misma persona puede ser cliente/proveedor/personal de dos
    // restaurantes distintos.
    const unicosPorDocumento: Array<[string, string]> = [
      ['clientes', 'IDX_393e5d5ea9b4fefa4f06f37c06'],
      ['proveedores', 'IDX_e625eb15d65188cd3da1c2a904'],
      ['personal', 'IDX_3b72d8245b351e05df50750658'],
    ];
    for (const [tabla, indice] of unicosPorDocumento) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${indice}"`);
      await queryRunner.query(`
        CREATE UNIQUE INDEX "UQ_${tabla}_empresa_documento"
          ON "${tabla}" ("empresa_id", "tipo_documento_identidad_id", "numero_documento")
      `);
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_3cd5652ab34ca1a0a2c7a25531"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_clientes_empresa_email" ON "clientes" ("empresa_id", "email")`,
    );

    // Una sola caja abierta POR EMPRESA. El índice anterior era global: con dos empresas,
    // la segunda no podía abrir caja mientras la primera la tuviera abierta.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_una_caja_abierta"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_una_caja_abierta_por_empresa"
        ON "cajas" ("empresa_id", "estado") WHERE "estado" = 'abierta'
    `);

    // Correlativo de comprobantes: dos empresas usan ambas la serie B001 y cada una lleva su
    // propia numeración. Sin el `empresa_id`, la segunda chocaría contra la primera.
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_un_correlativo_por_serie"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_un_correlativo_por_serie"
        ON "ventas" ("empresa_id", "tipo_comprobante_id", "serie", "numero")
    `);

    // `usuarios.email` se mantiene único globalmente a propósito: el login es solo email +
    // contraseña, sin selector de empresa, así que un mismo correo no puede pertenecer a dos
    // empresas o no habría forma de saber a cuál entrar. Ver `decisiones-tecnicas.md`.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_un_correlativo_por_serie"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_un_correlativo_por_serie"
        ON "ventas" ("tipo_comprobante_id", "serie", "numero")
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_una_caja_abierta_por_empresa"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_una_caja_abierta"
        ON "cajas" ("estado") WHERE "estado" = 'abierta'
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_clientes_empresa_email"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3cd5652ab34ca1a0a2c7a25531" ON "clientes" ("email")`,
    );

    for (const [tabla, indice] of [
      ['clientes', 'IDX_393e5d5ea9b4fefa4f06f37c06'],
      ['proveedores', 'IDX_e625eb15d65188cd3da1c2a904'],
      ['personal', 'IDX_3b72d8245b351e05df50750658'],
    ]) {
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${tabla}_empresa_documento"`);
      await queryRunner.query(`
        CREATE UNIQUE INDEX "${indice}"
          ON "${tabla}" ("tipo_documento_identidad_id", "numero_documento")
      `);
    }

    for (const [tabla, restriccion] of [
      ['categorias', 'UQ_ccdf6cd1a34ea90a7233325063d'],
      ['marcas', 'UQ_29f5713899c32a96a8900143c6f'],
      ['salones', 'UQ_22f300f5acac0288304a41c3260'],
      ['insumos', 'UQ_0d28ae68a8f742beb176aa51ae0'],
      ['roles', 'UQ_a5be7aa67e759e347b1c6464e10'],
    ]) {
      await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${tabla}_empresa_nombre"`);
      await queryRunner.query(
        `ALTER TABLE "${tabla}" ADD CONSTRAINT "${restriccion}" UNIQUE ("nombre")`,
      );
    }

    for (const tabla of [...this.tablas].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${tabla}" DROP CONSTRAINT IF EXISTS "FK_${tabla}_empresa"`,
      );
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_${tabla}_empresa"`);
      await queryRunner.query(`ALTER TABLE "${tabla}" DROP COLUMN IF EXISTS "empresa_id"`);
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_empresas_slug"`);
    await queryRunner.query(`
      ALTER TABLE "empresas"
        DROP COLUMN IF EXISTS "slug",
        DROP COLUMN IF EXISTS "plan",
        DROP COLUMN IF EXISTS "demo_expira_en",
        DROP COLUMN IF EXISTS "suspendida",
        DROP COLUMN IF EXISTS "creada_por_autoservicio"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "empresas_plan_enum"`);
  }
}
