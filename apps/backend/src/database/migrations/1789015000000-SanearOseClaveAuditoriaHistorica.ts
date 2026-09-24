import { MigrationInterface, QueryRunner } from 'typeorm';
import { activarBypassRls } from '../bypass-rls';

/**
 * H02 — Sanea `oseClave` (credencial del proveedor OSE) que quedó en texto plano en filas
 * históricas de `registros_auditoria` antes de que ese campo se agregara a la denylist de
 * `campos-sensibles.ts` (ver `docs/auditoria/BACKLOG-TECNICO.md`).
 *
 * H02-R01 (revisión Codex): la primera versión de esta migración solo saneaba el nivel
 * superior de `datos`. Eso es insuficiente porque `auditoriaMiddleware` captura el body ANTES
 * de `validateBody` — un `PUT /api/facturacion/configuracion` rechazado por el DTO (por
 * ejemplo, `oseProveedor` inválido) igual queda auditado con el body tal como llegó, y nada
 * garantiza que ese body rechazado tuviera la forma plana que exige el schema. Un cliente (o
 * un bug de otro momento del frontend) pudo haber mandado `{ configuracion: { oseClave: ... }
 * }` o `[{ oseClave: ... }]`, que el DTO habría rechazado pero que `auditoriaMiddleware` ya
 * había capturado igual. Por eso el saneamiento histórico tiene que alcanzar cualquier
 * profundidad, no solo el nivel superior.
 *
 * Alcance SIGUE acotado a `oseClave` y sus variantes normalizadas, no a todo
 * `CAMPOS_SENSIBLES` — es el único campo con evidencia confirmada de fuga histórica; ampliar a
 * otros nombres sin evidencia equivalente alteraría filas de auditoría sin una razón concreta.
 *
 * Alcance SIGUE acotado a `modulo = 'facturacion'`. Evidencia (grep exhaustivo del repositorio
 * completo, backend y frontend, por `oseClave`): el nombre de campo `oseClave` no aparece en
 * ningún DTO, controlador, ruta ni componente de frontend fuera de
 * `facturacion.dto.ts`/`facturacion.service.ts`/`FacturacionElectronica.tsx` —
 * `PUT /api/facturacion/configuracion` es el único punto del sistema que alguna vez pudo
 * recibirlo. `modulo` se deriva de la URL (`moduloDe()` en `auditoria.middleware.ts`), no del
 * contenido ni de la validación del body, así que vale `'facturacion'` tanto para las
 * peticiones aceptadas como para las rechazadas por el DTO contra ese mismo endpoint — el filtro
 * no excluye ningún caso real de los descritos arriba. (Queda fuera de este alcance, por no
 * tener evidencia real que lo respalde, el caso puramente adversarial de un cliente mandando
 * `oseClave` como campo suelto a un endpoint no relacionado; se documenta como riesgo residual,
 * no como alcance a ampliar — ver el reporte de esta corrección.)
 *
 * Regla de normalización IDÉNTICA a `normalizarNombreCampo()` (`campos-sensibles.ts`):
 * minúsculas + sin `_` ni `-`. Debe mantenerse igual en ambos lugares — una divergencia dejaría,
 * por ejemplo, `ose-clave` protegido en peticiones nuevas pero sin sanear en el histórico, o
 * viceversa.
 *
 * ESTRATEGIA (evaluadas explícitamente, ver reporte de H02-R01 para el detalle comparativo):
 *   A. Función PL/pgSQL recursiva — ELEGIDA.
 *   B. Función TypeScript recursiva leyendo/actualizando filas desde el runner de la migración.
 *   C. CTE recursivo puro (`WITH RECURSIVE`) sin función.
 *   D. Otra.
 *
 * Se eligió (A) porque:
 *   - Toda la transformación ocurre DENTRO de Postgres, en la misma transacción que el resto
 *     del lote de migraciones (`migrationsTransactionMode: "all"`): no hay ronda de ida y
 *     vuelta cargando filas completas a la memoria del proceso Node que ejecuta la migración
 *     (a diferencia de (B)), lo que además evita que el secreto pase, aunque sea de forma
 *     efímera, por un valor de JavaScript fuera de la base.
 *   - Un `WITH RECURSIVE` puro (C) sirve para recorrer una jerarquía de FILAS relacionadas
 *     entre sí (por ejemplo un árbol con `padre_id`), no para recorrer la estructura interna y
 *     arbitrariamente anidada de un único valor JSONB — modelar eso como CTE recursivo exigiría
 *     "aplanar" el árbol JSON en filas y reconstruirlo después, que es exactamente lo que una
 *     función recursiva ya hace de forma natural y con el tipo de dato correcto (`jsonb` entra
 *     y sale, sin pasar por una representación intermedia de filas).
 *   - Una función es fácil de probar de forma aislada (T09 la ejercita a través del `up()` real,
 *     no de una reimplementación) y fácil de eliminar después de usarla (`DROP FUNCTION` al
 *     final de `up()`): no deja un objeto permanente en el esquema para un saneamiento que es,
 *     por diseño, una operación de una sola vez.
 *   - Es total (no lanza) para cualquier valor de entrada: objeto, array, string, number,
 *     boolean, JSON `null` o incluso `NULL` de SQL — no hace falta acotar el `WHERE` externo
 *     por `jsonb_typeof`, a diferencia de la primera versión de esta migración.
 *
 * VOLUMEN: el `WHERE modulo = 'facturacion'` usa el índice compuesto ya existente
 * (`IDX_auditoria_modulo_fecha`) para acotar el conjunto de filas antes de aplicar la función
 * recursiva — no se recorre la tabla completa de auditoría, solo las filas de ese módulo.
 *
 * PRESERVACIÓN DEL JSON: la función reconstruye cada objeto/array recorriendo sus propiedades
 * o elementos uno por uno y copiándolos tal cual, salvo cuando la CLAVE de una propiedad
 * normaliza a `oseclave` — en ese único caso reemplaza el VALOR (nunca la clave) por
 * `'[redactado]'`, sin importar de qué tipo era ese valor. El resto de claves, strings,
 * números, booleanos y `null` viajan sin tocar. El orden de claves de un objeto JSONB no es
 * semánticamente significativo y no se garantiza preservado (Postgres no lo garantiza para
 * ningún valor `jsonb`, con o sin esta migración).
 */
export class SanearOseClaveAuditoriaHistorica1789015000000 implements MigrationInterface {
  name = 'SanearOseClaveAuditoriaHistorica1789015000000';

  /** Nombre de la función auxiliar, temporal a esta migración (se crea y se elimina dentro de
   * `up()`). Prefijo `h02_` para que un choque de nombres con cualquier otra cosa del esquema
   * sea, además de improbable, inmediatamente identificable como relacionado con este cambio. */
  private readonly FUNCION = 'h02_redactar_oseclave_recursivo';

  /** Mismo literal que `REDACTADO` en `campos-sensibles.ts` — filas históricas y nuevas deben
   * quedar con exactamente el mismo valor para que cualquier consulta/reporte las trate igual. */
  private readonly REDACTADO = '[redactado]';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // registros_auditoria está bajo RLS por empresa; sin el bypass esta migración solo vería
    // (y sanearía) las filas de una empresa fijada por casualidad, dejando el resto sin tocar
    // en silencio — el mismo motivo por el que lo usan las migraciones de H01. No se toca RLS
    // en sí (ni se desactiva globalmente): el bypass es local a esta transacción de migración,
    // igual que en el resto del proyecto.
    await activarBypassRls(queryRunner);

    // Función total y recursiva: para un objeto, reconstruye cada propiedad (redactando el
    // valor solo si su clave normaliza a `oseclave`); para un array, reconstruye cada elemento
    // aplicando la misma función; para cualquier otro tipo JSON (string, number, boolean,
    // `null`), lo devuelve sin tocar. No imprime nada (sin `RAISE NOTICE`/`RAISE WARNING` con
    // contenido) y no escribe en ninguna tabla — solo calcula y devuelve un valor `jsonb`.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "${this.FUNCION}"(valor jsonb) RETURNS jsonb
      LANGUAGE plpgsql IMMUTABLE AS $FUNC$
      DECLARE
        resultado jsonb;
        clave text;
        elemento jsonb;
      BEGIN
        IF valor IS NULL THEN
          RETURN NULL;
        END IF;

        IF jsonb_typeof(valor) = 'object' THEN
          resultado := '{}'::jsonb;
          FOR clave IN SELECT jsonb_object_keys(valor) LOOP
            IF lower(replace(replace(clave, '_', ''), '-', '')) = 'oseclave' THEN
              resultado := resultado || jsonb_build_object(clave, to_jsonb('${this.REDACTADO}'::text));
            ELSE
              resultado := resultado || jsonb_build_object(clave, "${this.FUNCION}"(valor -> clave));
            END IF;
          END LOOP;
          RETURN resultado;
        ELSIF jsonb_typeof(valor) = 'array' THEN
          resultado := '[]'::jsonb;
          FOR elemento IN SELECT * FROM jsonb_array_elements(valor) LOOP
            resultado := resultado || jsonb_build_array("${this.FUNCION}"(elemento));
          END LOOP;
          RETURN resultado;
        ELSE
          RETURN valor;
        END IF;
      END;
      $FUNC$
    `);

    // El `CTE` calcula el resultado UNA vez por fila candidata (no una vez en el WHERE y otra
    // en el SET) y el `UPDATE` solo escribe las filas donde el resultado realmente difiere del
    // valor actual — eso es lo que hace idempotente la migración: en una segunda corrida, para
    // toda fila ya saneada, `datos_nuevo` sale idéntico a `datos` y no se actualiza nada.
    // `datos IS NOT NULL` excluye el SQL NULL (distinto del `null` de JSON, que la función ya
    // maneja); no hace falta ningún filtro por `jsonb_typeof` porque la función es total.
    await queryRunner.query(`
      WITH candidatos AS (
        SELECT "id", "datos", "${this.FUNCION}"("datos") AS "datos_nuevo"
        FROM "registros_auditoria"
        WHERE "modulo" = 'facturacion' AND "datos" IS NOT NULL
      )
      UPDATE "registros_auditoria" AS r
      SET "datos" = c."datos_nuevo"
      FROM candidatos c
      WHERE r."id" = c."id"
        AND c."datos_nuevo" IS DISTINCT FROM c."datos"
    `);

    // Función de un solo uso: no debe quedar como objeto permanente del esquema.
    await queryRunner.query(`DROP FUNCTION IF EXISTS "${this.FUNCION}"(jsonb)`);
  }

  /**
   * Irreversible por seguridad: las credenciales saneadas nunca deben restaurarse.
   *
   * Deliberadamente NO-OP (no lanza, no reconstruye, no recupera el valor original). Un
   * `down()` que lanzara un error rompería `migration:revert` para cualquier lote posterior que
   * incluyera esta migración; un `down()` que restaurara el valor original volvería a exponer
   * la credencial — ambas alternativas son peores que simplemente no deshacer un saneamiento de
   * seguridad. El estado saneado se conserva sin importar qué se revierta después.
   */
  public async down(): Promise<void> {
    // Irreversible por seguridad. Las credenciales saneadas nunca deben restaurarse.
  }
}
