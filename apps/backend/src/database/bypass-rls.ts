import type { QueryRunner } from 'typeorm';

/**
 * Desactiva las políticas RLS durante la transacción de una migración.
 *
 * **Toda migración que lea o escriba DATOS de una tabla bajo RLS tiene que llamar a esto
 * primero.** El DDL puro (crear columnas, índices, tipos) no lo necesita.
 *
 * Por qué hace falta: las migraciones corren sin contexto de petición, así que
 * `app.empresa_id` está vacío y las políticas —que fallan cerrado— no dejan ver ninguna
 * fila. En desarrollo esto pasa desapercibido porque el rol de migraciones que crea la
 * imagen de Docker es superusuario y se salta RLS; pero en un Postgres gestionado (Neon,
 * Supabase, Railway) el rol que se recibe suele ser dueño de las tablas **sin** ser
 * superusuario, y ahí `FORCE ROW LEVEL SECURITY` sí lo alcanza: el `UPDATE` de la migración
 * afectaría cero filas y fallaría en silencio, dejando la base a medio configurar.
 *
 * `set_config(..., true)` es local a la transacción de la migración: no se escapa ni queda
 * pegado en la conexión.
 */
export async function activarBypassRls(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
}
