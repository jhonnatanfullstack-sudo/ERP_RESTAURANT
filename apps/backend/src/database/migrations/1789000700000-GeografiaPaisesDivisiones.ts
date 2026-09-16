import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Geografía multi-país: `paises` (ISO 3166-1) y `divisiones_administrativas` (departamento →
 * provincia → distrito de Perú, o el nivel equivalente de cualquier otro país) (FASE 27).
 *
 * **Por qué una tabla genérica y no `departamentos`/`provincias`/`distritos` separadas.** Cada
 * país organiza su territorio distinto (estados, cantones, comunas...); una tabla
 * autorreferenciada por `padre_id` con un `nivel` (1/2/3) representa cualquiera de esos
 * esquemas sin cambiar el modelo cuando se sume un país nuevo — solo se agregan filas.
 *
 * **Por qué se siembra Perú completo y ningún otro país en `divisiones_administrativas`.** Hoy
 * el 100% de los clientes son peruanos; los demás países quedan con el esquema listo pero sin
 * datos hasta que haga falta (CLAUDE.md sección 1: diseñar la arquitectura, no implementar lo
 * que no hace falta todavía).
 *
 * **De dónde sale la data.** `paises-iso3166.json` (249 países, ISO 3166-1 alpha-2/alpha-3) y
 * `ubigeo-peru.json` (25 departamentos, 196 provincias, 1892 distritos — UBIGEO de INEI/RENIEC,
 * la misma fuente que ya usa el catálogo SUNAT) viven en `database/seeds/` como JSON, no
 * tipeados a mano en esta migración: así se pueden auditar/regenerar por separado. Los
 * `migration:*` de `package.json` corren con `tsx` directo sobre `src/`, así que `__dirname`
 * apunta aquí mismo tanto en desarrollo como en producción — no hace falta copiarlos a `dist/`.
 *
 * **Por qué no llevan `empresa_id` ni política RLS.** Son catálogos globales, igual que
 * `tipos_documento_identidad` — ver la lista de tablas de `1789000100000-RlsMultiEmpresa.ts`,
 * que las excluye a propósito.
 */
export class GeografiaPaisesDivisiones1789000700000 implements MigrationInterface {
  name = 'GeografiaPaisesDivisiones1789000700000';

  private readonly rutaSeeds = join(__dirname, '../seeds');
  private readonly codigoIso2Peru = 'PE';

  private cargarJson<T>(archivo: string): T {
    return JSON.parse(readFileSync(join(this.rutaSeeds, archivo), 'utf8')) as T;
  }

  /** Inserta en bloques de `tamano` filas para no acercarse al límite de parámetros por
   * sentencia de Postgres (65535) con los ~1900 distritos. */
  private async insertarEnBloques(
    queryRunner: QueryRunner,
    encabezado: string,
    filas: unknown[][],
    tamano = 500,
  ): Promise<void> {
    for (let inicio = 0; inicio < filas.length; inicio += tamano) {
      const lote = filas.slice(inicio, inicio + tamano);
      const columnas = lote[0].length;
      const marcadores = lote
        .map((_fila, indice) => {
          const base = indice * columnas;
          const placeholders = Array.from({ length: columnas }, (_c, col) => `$${base + col + 1}`);
          return `(${placeholders.join(', ')})`;
        })
        .join(', ');
      await queryRunner.query(`${encabezado} VALUES ${marcadores}`, lote.flat());
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- 1. Esquema ----------------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "paises" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "codigo_iso2" varchar(2) NOT NULL,
        "codigo_iso3" varchar(3) NOT NULL,
        "nombre" varchar(100) NOT NULL,
        "activo" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_paises" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_paises_codigo_iso2" UNIQUE ("codigo_iso2"),
        CONSTRAINT "UQ_paises_codigo_iso3" UNIQUE ("codigo_iso3")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "divisiones_administrativas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "pais_id" uuid NOT NULL,
        "padre_id" uuid,
        "nivel" smallint NOT NULL,
        "nombre" varchar(100) NOT NULL,
        "codigo" varchar(20),
        "activo" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_divisiones_administrativas" PRIMARY KEY ("id"),
        CONSTRAINT "FK_divisiones_administrativas_pais" FOREIGN KEY ("pais_id")
          REFERENCES "paises"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_divisiones_administrativas_padre" FOREIGN KEY ("padre_id")
          REFERENCES "divisiones_administrativas"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_divisiones_administrativas_pais_padre_nombre"
        ON "divisiones_administrativas" ("pais_id", "padre_id", "nombre")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_divisiones_administrativas_padre"
        ON "divisiones_administrativas" ("padre_id")
    `);

    // --- 2. Seed: países (ISO 3166-1) -----------------------------------------------------
    interface PaisSeed {
      nombre: string;
      codigoIso2: string;
      codigoIso3: string;
    }
    const paises = this.cargarJson<PaisSeed[]>('paises-iso3166.json');
    await this.insertarEnBloques(
      queryRunner,
      `INSERT INTO "paises" ("codigo_iso2", "codigo_iso3", "nombre")`,
      paises.map((p) => [p.codigoIso2, p.codigoIso3, p.nombre]),
    );

    const [peru] = (await queryRunner.query(`SELECT "id" FROM "paises" WHERE "codigo_iso2" = $1`, [
      this.codigoIso2Peru,
    ])) as Array<{ id: string }>;
    if (!peru) {
      throw new Error('El seed de países no incluyó Perú (PE) — no se puede sembrar el UBIGEO');
    }

    // --- 3. Seed: UBIGEO de Perú, nivel por nivel (necesita el id del padre ya insertado) --
    interface DivisionSeed {
      nivel: number;
      codigo: string;
      nombre: string;
      codigoPadre: string | null;
    }
    const filas = this.cargarJson<DivisionSeed[]>('ubigeo-peru.json');

    // Arrow function (no `function` propia) para heredar el `this` de `up()` y poder llamar
    // `this.insertarEnBloques` sin `.call`/`.bind`.
    const insertarNivel = async (
      nivel: number,
      padrePorCodigo: Map<string, string> | null,
    ): Promise<Map<string, string>> => {
      const delNivel = filas.filter((f) => f.nivel === nivel);
      await this.insertarEnBloques(
        queryRunner,
        `INSERT INTO "divisiones_administrativas"
           ("pais_id", "padre_id", "nivel", "nombre", "codigo")`,
        delNivel.map((f) => [
          peru.id,
          padrePorCodigo && f.codigoPadre ? (padrePorCodigo.get(f.codigoPadre) ?? null) : null,
          nivel,
          f.nombre,
          f.codigo,
        ]),
      );
      const insertadas = (await queryRunner.query(
        `SELECT "id", "codigo" FROM "divisiones_administrativas"
          WHERE "pais_id" = $1 AND "nivel" = $2`,
        [peru.id, nivel],
      )) as Array<{ id: string; codigo: string }>;
      return new Map(insertadas.map((fila) => [fila.codigo, fila.id]));
    };

    const departamentosPorCodigo = await insertarNivel(1, null);
    const provinciasPorCodigo = await insertarNivel(2, departamentosPorCodigo);
    await insertarNivel(3, provinciasPorCodigo);

    // --- 4. `empresas` gana país y distrito -----------------------------------------------
    await queryRunner.query(`
      ALTER TABLE "empresas"
        ADD COLUMN "pais_id" uuid,
        ADD COLUMN "distrito_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "empresas"
        ADD CONSTRAINT "FK_empresas_pais" FOREIGN KEY ("pais_id")
          REFERENCES "paises"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_empresas_distrito" FOREIGN KEY ("distrito_id")
          REFERENCES "divisiones_administrativas"("id") ON DELETE RESTRICT
    `);

    // Toda empresa existente antes de esta fase es peruana: backfill directo. Si además su
    // `ubigeo` de texto libre ya coincide con un distrito real, se enlaza de una vez — así una
    // empresa que ya lo tenía cargado a mano no pierde el selector geográfico en el frontend.
    await queryRunner.query(`UPDATE "empresas" SET "pais_id" = $1 WHERE "pais_id" IS NULL`, [
      peru.id,
    ]);
    await queryRunner.query(`
      UPDATE "empresas" e SET "distrito_id" = d."id"
        FROM "divisiones_administrativas" d
       WHERE d."nivel" = 3 AND d."codigo" = e."ubigeo" AND e."distrito_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "empresas"
        DROP CONSTRAINT IF EXISTS "FK_empresas_pais",
        DROP CONSTRAINT IF EXISTS "FK_empresas_distrito"
    `);
    await queryRunner.query(`
      ALTER TABLE "empresas"
        DROP COLUMN IF EXISTS "pais_id",
        DROP COLUMN IF EXISTS "distrito_id"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "divisiones_administrativas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "paises"`);
  }
}
