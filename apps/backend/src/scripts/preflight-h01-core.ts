import type { ClientBase } from 'pg';
import { z } from 'zod';

/**
 * H01-R13 (`docs/auditoria/BACKLOG-TECNICO.md`) — Recuperación de instalaciones PRE-H01 con
 * más de un usuario `es_proveedor = true`.
 *
 * SOLO para esa situación excepcional, ANTES de correr `migration:run` por primera vez tras
 * actualizar a H01. El mecanismo normal, en cualquier instalación que ya corrió H01 con éxito,
 * sigue siendo `proveedor-bootstrap.service.ts` + `pnpm proveedor:asignar/quitar/listar`. Esto
 * no reemplaza a ese servicio ni debe promocionarse como vía habitual — ver
 * `docs/despliegue.md`.
 *
 * Por qué falta hacer esto: `pnpm migration:run` corre con el modo transaccional por defecto
 * de TypeORM (`all` — no se pasa `-t` ni se fija `migrationsTransactionMode` en ningún
 * `DataSource` de este proyecto). En ese modo, `MigrationExecutor` envuelve TODAS las
 * migraciones pendientes en una única transacción y solo confirma al final, si todas
 * terminaron sin error (código real: `apps/backend/node_modules/typeorm/migration/
 * MigrationExecutor.js`). Si `UnicoProveedorGlobal` falla porque detecta más de un proveedor,
 * se revierte TODA esa transacción — incluida `NeutralizarProveedorSemilla`, que es la que
 * agrega la columna `debe_cambiar_password`. Es decir: tras ese fallo, esa columna vuelve a no
 * existir, y con ella tampoco puede funcionar nada que dependa de ella (la entidad `Usuario`
 * actual, `proveedor-bootstrap.service.ts`, el CLI normal). Por eso este archivo NO importa
 * ninguno de esos tres: tiene que poder ejecutarse ANTES de que esa columna exista, así que
 * solo usa columnas que existen desde antes de H01 (`id`, `email`, `es_proveedor`), con SQL
 * parametrizado directo — nunca a través de un repositorio de TypeORM.
 *
 * Recibe un cliente `pg` ya conectado (`Client` o `PoolClient`, ambos extienden `ClientBase`)
 * en vez de crear el suyo: mantiene este módulo agnóstico de cómo se conecta quien lo usa (el
 * CLI real usa sus propias credenciales de dueño; las pruebas usan una base temporal) — mismo
 * motivo por el que `proveedor-bootstrap.service.ts` no asume tampoco cómo se autenticó quien
 * lo llama.
 *
 * H01-R13 (revisión Codex, corrección quirúrgica) — la selección de a quién conservar NO puede
 * decidirse por email: `usuarios.email` es sensible a mayúsculas/minúsculas (no hay una
 * restricción histórica que lo normalice), así que `"Proveedor@dominio.com"` y
 * `"proveedor@dominio.com"` pueden coexistir como dos cuentas distintas. Comparar por
 * `email.toLowerCase()` para elegir a quién dejarle una marca privilegiada (`es_proveedor`) es
 * ambiguo en ese caso — no hay forma de saber cuál de las dos quiso decir el operador. La
 * identidad final de esta operación es `usuarios.id` (UUID, siempre único); el email solo se
 * expone como ayuda visual para que un humano reconozca la cuenta, nunca como criterio de
 * autorización. Esto también evita depender de H01-R08 (normalización global de emails, ya
 * diferido) para que esta herramienta sea correcta.
 */

export interface ProveedorPreH01 {
  id: string;
  email: string;
}

/** Código de Postgres para "la tabla no existe" (`undefined_table`). */
const TABLA_NO_EXISTE = '42P01';

/**
 * Lista, dentro de una transacción propia (necesaria para que el bypass de RLS aplique: es
 * `set_config(..., true)`, local a la transacción — mismo patrón que `activarBypassRls`),
 * todos los usuarios con `es_proveedor = true` en toda la base, sin importar la empresa.
 *
 * Si la tabla `usuarios` todavía no existe (instalación nueva, ninguna migración corrió
 * todavía), se trata como "sin conflicto": no hay nada que resolver antes del primer
 * `migration:run`.
 */
export async function verificarProveedoresPreH01(cliente: ClientBase): Promise<ProveedorPreH01[]> {
  await cliente.query('BEGIN');
  try {
    await cliente.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const resultado = await cliente.query(
      `SELECT "id", "email" FROM "usuarios" WHERE "es_proveedor" = true ORDER BY "email"`,
    );
    await cliente.query('COMMIT');
    return resultado.rows as ProveedorPreH01[];
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    if ((error as { code?: string })?.code === TABLA_NO_EXISTE) {
      return [];
    }
    throw error;
  }
}

/**
 * Distinta, a propósito, de `CLAVE_ADVISORY_LOCK_PROVEEDOR` de `proveedor-bootstrap.service.ts`
 * (`780_100_01`): este archivo no puede importar ese módulo (ver el comentario de arriba de
 * este archivo), así que usa su propia clave — de la misma familia numérica, pero exclusiva de
 * esta recuperación. Solo protege contra dos ejecuciones concurrentes de ESTA MISMA
 * herramienta: el servicio normal no puede funcionar todavía en el escenario en que esta
 * herramienta se usa (la columna que necesita no existe), así que no hay colisión real posible
 * entre ambos.
 */
const CLAVE_ADVISORY_LOCK_RECUPERACION_PRE_H01 = 780_100_02;

/** El `id` indicado no es válido como UUID — nunca se llega a abrir una transacción por esto. */
export class IdInvalidoError extends Error {}

/** El `id` indicado para conservar no es ninguno de los que están en conflicto ahora mismo (ni
 * existe, ni existe pero no es proveedor en este momento — ambos casos se rechazan igual: lo
 * único que importa es el conjunto de `es_proveedor = true` verificado en esta transacción). */
export class ProveedorNoEnConflictoError extends Error {}

/** Ya no hay conflicto que resolver (0 o 1 proveedores) en el momento de escribir. */
export class SinConflictoPreH01Error extends Error {}

const esquemaId = z.string().uuid();

/**
 * Revoca `es_proveedor` a todos los usuarios en conflicto EXCEPTO al indicado en `mantenerId`.
 *
 * La identidad es `usuarios.id`, nunca el email (ver el comentario de cabecera del archivo:
 * `email` puede repetirse salvo por mayúsculas/minúsculas, así que no es inequívoco). Nunca
 * elige por sí sola a quién conservar: `mantenerId` tiene que ser una decisión explícita de
 * quien invoca esto, y tiene que ser el id de uno de los que esta misma función encuentra en
 * conflicto en este momento — si no lo es, se rechaza sin tocar nada.
 *
 * Vuelve a consultar el conflicto DENTRO de esta misma transacción antes de modificar nada: el
 * estado pudo cambiar entre que se listó el conflicto y se decidió a quién conservar (otro
 * operador, u otra ejecución de esta misma herramienta). Si para entonces ya no hay conflicto,
 * no modifica nada — es un resultado válido, no un error.
 *
 * Antes de confirmar, verifica dos cosas por separado — no basta con `COUNT(*) = 1`, que sería
 * cierto incluso si por algún error quedara proveedor un usuario distinto del elegido: (a)
 * queda exactamente un usuario con `es_proveedor = true`, y (b) ese usuario es exactamente
 * `mantenerId`.
 *
 * No borra usuarios, no cambia contraseñas, no toca `personal` ni `empresas`: la única columna
 * que esta función escribe es `usuarios.es_proveedor`.
 */
export async function resolverProveedorPreH01(
  cliente: ClientBase,
  opciones: { mantenerId: string },
): Promise<{ mantenido: ProveedorPreH01; revocados: ProveedorPreH01[] }> {
  const parseoId = esquemaId.safeParse(opciones.mantenerId);
  if (!parseoId.success) {
    throw new IdInvalidoError(`"${opciones.mantenerId}" no es un id válido (se esperaba un UUID).`);
  }
  const idMantener = parseoId.data;

  await cliente.query('BEGIN');
  try {
    await cliente.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    await cliente.query('SELECT pg_advisory_xact_lock($1)', [
      CLAVE_ADVISORY_LOCK_RECUPERACION_PRE_H01,
    ]);

    const enConflicto = (
      await cliente.query(
        `SELECT "id", "email" FROM "usuarios" WHERE "es_proveedor" = true ORDER BY "email"`,
      )
    ).rows as ProveedorPreH01[];

    if (enConflicto.length <= 1) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw new SinConflictoPreH01Error(
        `No hay ningún conflicto que resolver: hay ${enConflicto.length} usuario(s) marcado(s) ` +
          'como proveedor.',
      );
    }

    // Identidad por `id`, nunca por email — ver comentario de cabecera del archivo. Comparación
    // directa de UUIDs, sin normalizar mayúsculas/minúsculas de nada.
    const elegido = enConflicto.find((fila) => fila.id === idMantener);
    if (!elegido) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw new ProveedorNoEnConflictoError(
        `El id "${idMantener}" no es ninguno de los proveedores en conflicto ahora mismo (` +
          `${enConflicto.map((f) => `${f.id} — ${f.email}`).join('; ')}). No se modificó nada.`,
      );
    }

    const otros = enConflicto.filter((fila) => fila.id !== elegido.id);
    await cliente.query(`UPDATE "usuarios" SET "es_proveedor" = false WHERE "id" = ANY($1::uuid[])`, [
      otros.map((fila) => fila.id),
    ]);

    // No basta con contar: se verifica también que el único que queda sea, por id, el elegido —
    // nunca otro usuario que por algún motivo hubiera quedado proveedor.
    const verificacionFinal = (
      await cliente.query(`SELECT "id" FROM "usuarios" WHERE "es_proveedor" = true`)
    ).rows as Array<{ id: string }>;
    if (verificacionFinal.length !== 1 || verificacionFinal[0].id !== elegido.id) {
      throw new Error(
        `Tras revocar, la comprobación final no coincide: quedaron ${verificacionFinal.length} ` +
          `proveedor(es) y se esperaba exactamente 1 con id "${elegido.id}". No se confirmó el cambio.`,
      );
    }

    await cliente.query('COMMIT');
    return { mantenido: elegido, revocados: otros };
  } catch (error) {
    if (!(error instanceof SinConflictoPreH01Error) && !(error instanceof ProveedorNoEnConflictoError)) {
      await cliente.query('ROLLBACK').catch(() => {});
    }
    throw error;
  }
}
