import { MigrationInterface, QueryRunner } from 'typeorm';
import { activarBypassRls } from '../bypass-rls';

/**
 * H20 — "Reparto duplicable de propinas". `crearReparto` (`reparto-propina.service.ts`) nunca
 * verificó si ya existía un reparto sobre el mismo período, o uno que se superpusiera: cada
 * llamada vuelve a sumar `ventas.propina` por rango de fecha desde cero, sin excluir nada ya
 * repartido. Dos repartos sobre fechas iguales, o simplemente solapadas (total o
 * parcialmente), pagan la misma propina dos veces.
 *
 * La garantía se mueve a Postgres — mismo criterio ya usado en este proyecto para "una sola
 * caja abierta" (`IDX_una_caja_abierta_por_empresa`) y "un solo proveedor global"
 * (`UnicoProveedorGlobal`): un invariante de negocio verificado a nivel de storage, en cada
 * `INSERT`, sin importar qué código lo dispare, y sin la ventana de carrera (TOCTOU) que
 * tendría un "SELECT si existe, si no INSERT" hecho solo en la aplicación.
 *
 * A diferencia de esos dos precedentes (un índice único parcial alcanza porque el invariante es
 * "como máximo una fila con tal valor"), acá el invariante es sobre **solapamiento de rangos**,
 * no igualdad exacta — un `UNIQUE(empresa_id, fecha_desde, fecha_hasta)` solo bloquearía el
 * duplicado exacto, dejando pasar un segundo reparto con fechas apenas distintas que igual
 * vuelve a cubrir las mismas propinas. Se usa un `EXCLUDE USING gist`, el mecanismo nativo de
 * Postgres para "ninguna fila puede solapar con otra según este operador" — acá, `&&`
 * (solapamiento) sobre `tstzrange(fecha_desde, fecha_hasta, '[)')`, agrupado por `empresa_id`
 * (multi-empresa: dos empresas distintas SÍ pueden compartir el mismo rango exacto).
 *
 * Semántica temporal `[fecha_desde, fecha_hasta)` (inicio inclusivo, fin exclusivo) — deliberada
 * y consistente con el cambio equivalente en `calcularTotalPropinas`
 * (`reparto-propina.service.ts`, mismo commit): dos rangos adyacentes como `[.., B)` y `[B, ..)`
 * NO se consideran solapados, y una venta creada exactamente en el instante `B` pertenece
 * únicamente al segundo. Sin este acuerdo, el constraint y la consulta de ventas elegibles
 * podrían discrepar exactamente en ese instante límite.
 *
 * `EXCLUDE USING gist` con una columna de igualdad (`empresa_id`, tipo `uuid`) combinada con una
 * columna de rango requiere la extensión `btree_gist` (provee la clase de operadores GiST para
 * tipos escalares como `uuid`, que por defecto solo tienen índice `btree`). Postgres 18 (imagen
 * de este proyecto) la trae empaquetada; solo falta activarla con `CREATE EXTENSION IF NOT
 * EXISTS`, igual que ya ocurre —fuera de las migraciones de este proyecto— con `uuid-ossp`.
 */
export class ExclusionRepartosPropinasSolapados1789017000000 implements MigrationInterface {
  name = 'ExclusionRepartosPropinasSolapados1789017000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);

    // Solo para la LECTURA de verificación de abajo: sin empresa fijada, RLS no deja ver
    // ninguna fila, y "no hay conflictos" sería una mentira, no una comprobación real —mismo
    // motivo documentado en `UnicoProveedorGlobal`.
    await activarBypassRls(queryRunner);

    // Antes de agregar el constraint, se verifica que los datos YA EXISTENTES lo cumplan. Si
    // hay dos repartos de la misma empresa con rangos que se solapan bajo la semántica `[)`
    // adoptada arriba, la migración FALLA explícitamente (no fusiona, no borra, no reasigna
    // fechas): decidir qué reparto histórico es "el válido" es una decisión de negocio, no algo
    // que una migración deba resolver en silencio. Mismo criterio que `UnicoProveedorGlobal`.
    const conflictos: Array<{ reparto_a: string; reparto_b: string; empresa_id: string }> =
      await queryRunner.query(`
        SELECT a."id" AS "reparto_a", b."id" AS "reparto_b", a."empresa_id"
        FROM "repartos_propinas" a
        JOIN "repartos_propinas" b
          ON a."empresa_id" = b."empresa_id"
         AND a."id" < b."id"
         AND tstzrange(a."fecha_desde", a."fecha_hasta", '[)') && tstzrange(b."fecha_desde", b."fecha_hasta", '[)')
        LIMIT 20
      `);

    if (conflictos.length > 0) {
      const detalle = conflictos
        .map((c) => `(empresa ${c.empresa_id}: reparto ${c.reparto_a} solapa con ${c.reparto_b})`)
        .join(', ');
      throw new Error(
        `Existen repartos de propinas históricos con rangos de fecha solapados, lo que impide ` +
          `agregar la restricción de H20 sin decidir por ti cuál conservar: ${detalle}. Esta ` +
          'migración no fusiona, no borra ni reasigna fechas automáticamente — resuélvelo a ' +
          'mano (ej. dejar constancia de cuál de los dos repartos en conflicto se considera ' +
          'correcto para efectos contables) antes de volver a ejecutar la migración.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE "repartos_propinas"
        ADD CONSTRAINT "EXCL_repartos_propinas_solapamiento"
        EXCLUDE USING gist (
          "empresa_id" WITH =,
          tstzrange("fecha_desde", "fecha_hasta", '[)') WITH &&
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "repartos_propinas" DROP CONSTRAINT IF EXISTS "EXCL_repartos_propinas_solapamiento"`,
    );
    // No se hace `DROP EXTENSION "btree_gist"`: es una extensión compartida a nivel de base de
    // datos: revertir esta migración no debe arriesgarse a romper cualquier otro objeto que ya
    // la esté usando. Dejarla instalada es inofensivo (mismo criterio documentado para
    // `uuid-ossp`, que ninguna migración de este proyecto desinstala tampoco).
  }
}
