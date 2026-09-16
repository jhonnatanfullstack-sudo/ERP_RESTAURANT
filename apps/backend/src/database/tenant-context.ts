import { AsyncLocalStorage } from 'node:async_hooks';
import { AppDataSource } from './data-source';
import { HttpError } from '../utils/http-error';
import type { EntityManager, QueryRunner } from 'typeorm';

/**
 * Contexto multi-empresa de una petición. Vive en un `AsyncLocalStorage` para que cualquier
 * repositorio o service pueda saber a qué empresa pertenece la petición en curso sin tener
 * que arrastrar el `empresaId` por la firma de cada función (serían decenas de firmas, y un
 * solo olvido sería una fuga de datos entre clientes).
 */
export interface ContextoTenant {
  /** Empresa dueña de los datos. `null` mientras la petición todavía no se autenticó (login)
   * o en una operación deliberadamente transversal del proveedor. */
  empresaId: string | null;
  /** `EntityManager` de la transacción de esta petición — la única conexión donde está
   * seteado `app.empresa_id`, y por lo tanto la única donde las políticas RLS de Postgres
   * dejan ver algo. Todo acceso a datos de la petición tiene que pasar por aquí. */
  manager: EntityManager;
  queryRunner: QueryRunner;
  /** Callbacks en espera de que la transacción de la petición se confirme — ver `alConfirmar`
   * más abajo. `middlewares/tenant.middleware.ts` es quien los dispara. */
  pendientesTrasConfirmar: Array<() => void>;
}

const almacen = new AsyncLocalStorage<ContextoTenant>();

/**
 * Ejecuta `fn` dentro de la transacción de la petición en curso.
 *
 * Reemplaza a `AppDataSource.transaction(...)`, que abre una transacción **en otra
 * conexión** — una donde `app.empresa_id` nunca se fijó, y donde por lo tanto las políticas
 * RLS no dejarían ver ni escribir nada. Como la petición entera ya es una transacción (ver
 * `middlewares/tenant.middleware.ts`), aquí no hace falta abrir otra: basta con reusar su
 * manager, y la atomicidad que buscaban estos bloques se mantiene igual.
 *
 * Fuera de una petición (scripts, pruebas) abre una transacción propia, como antes.
 */
export async function enTransaccion<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
  const contexto = almacen.getStore();
  if (contexto) return fn(contexto.manager);
  return AppDataSource.transaction(fn);
}

/**
 * Ejecuta `fn` en una conexión **propia**, con su propia transacción y su propia empresa.
 *
 * Existe para el único caso legítimo de trabajo que ocurre **después** de que la petición
 * respondió: la bitácora de auditoría, que se escribe en `res.on('finish')`. Para entonces la
 * transacción de la petición ya se confirmó y su conexión volvió al pool, así que reusarla
 * falla con "Driver not Connected" — y como auditar nunca debe tumbar una operación, ese
 * fallo se traga y la bitácora se queda vacía en silencio.
 *
 * Que sea una conexión aparte además es lo correcto: una entrada de auditoría tiene que
 * sobrevivir aunque la operación auditada haya fallado y revertido.
 *
 * No usar esto para nada más. Cualquier trabajo que ocurra *durante* la petición debe ir en
 * su transacción, con `enTransaccion`.
 */
export async function ejecutarFueraDeLaPeticion<T>(
  empresaId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.empresa_id', $1, true)`, [empresaId]);
    const resultado = await almacen.run(
      { empresaId, manager: queryRunner.manager, queryRunner, pendientesTrasConfirmar: [] },
      fn,
    );
    await queryRunner.commitTransaction();
    return resultado;
  } catch (error) {
    if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export function ejecutarEnContexto<T>(contexto: ContextoTenant, fn: () => T): T {
  return almacen.run(contexto, fn);
}

/**
 * Encola `fn` para que corra recién cuando la transacción de la petición se haya confirmado
 * de verdad en Postgres — nunca antes.
 *
 * Pensado para notificaciones en tiempo real (WebSocket, ver `realtime/socket.ts`): emitirlas
 * ni bien se guarda la fila, todavía dentro de la transacción de la petición, le contaría a
 * los clientes conectados (una pantalla de cocina, por ejemplo) un cambio que un error más
 * adelante en esa misma petición podría hacer desaparecer con un rollback — el cliente ya
 * actualizó su pantalla con algo que nunca llegó a existir. `tenant.middleware.ts` dispara
 * esta cola justo después de `commitTransaction()` y antes de enviar la respuesta.
 *
 * Fuera de una petición (scripts, pruebas que no levantan el servidor de sockets) no hay
 * "después del commit" que esperar: se ejecuta de inmediato.
 */
export function alConfirmar(fn: () => void): void {
  const contexto = almacen.getStore();
  if (!contexto) {
    fn();
    return;
  }
  contexto.pendientesTrasConfirmar.push(fn);
}

export function contextoActual(): ContextoTenant | undefined {
  return almacen.getStore();
}

/** `EntityManager` de la petición en curso, o `null` fuera de una (arranque, migraciones,
 * scripts). Los repositorios caen al manager por defecto en ese caso. */
export function managerActual(): EntityManager | null {
  return almacen.getStore()?.manager ?? null;
}

/**
 * Empresa de la petición en curso. Lanza si no hay ninguna: un service de negocio que
 * necesita el `empresaId` y no lo encuentra tiene un problema de cableado, y fallar es
 * infinitamente preferible a escribir una fila sin dueño o leer las de otro.
 */
export function empresaIdActual(): string {
  const empresaId = almacen.getStore()?.empresaId;
  if (!empresaId) {
    throw new HttpError(500, 'No se pudo determinar la empresa de la petición');
  }
  return empresaId;
}

/** Igual que `empresaIdActual` pero devuelve `null` en vez de lanzar — para código que corre
 * tanto dentro como fuera de una petición con empresa (ej. sembrar catálogos). */
export function empresaIdActualOpcional(): string | null {
  return almacen.getStore()?.empresaId ?? null;
}

/**
 * Fija la empresa de la petición en curso y la propaga a Postgres, que es lo que activa las
 * políticas RLS. `set_config(..., true)` es local a la transacción: al cerrarla, el valor
 * desaparece solo y la conexión vuelve limpia al pool (un `SET` de sesión se quedaría pegado
 * y la siguiente petición que reusara esa conexión vería los datos de otra empresa).
 */
export async function establecerEmpresaDeLaPeticion(empresaId: string): Promise<void> {
  const contexto = almacen.getStore();
  if (!contexto) {
    throw new HttpError(500, 'No hay transacción de petición activa');
  }
  contexto.empresaId = empresaId;
  await contexto.queryRunner.query(`SELECT set_config('app.empresa_id', $1, true)`, [empresaId]);
}

/**
 * Ejecuta `fn` saltándose las políticas RLS. **Uso muy restringido**: solo el login (que
 * busca un usuario por email sin saber todavía a qué empresa pertenece) y el panel del
 * proveedor (que por definición consulta todas las empresas). Cada llamada nueva a esto es
 * una excepción al aislamiento y debe justificarse en el código.
 *
 * El `SET LOCAL` se revierte al cerrar la transacción de la petición, así que el bypass no
 * puede escaparse a otra petición ni quedarse pegado en la conexión.
 */
export async function conBypassRls<T>(fn: () => Promise<T>): Promise<T> {
  const contexto = almacen.getStore();
  if (!contexto) return fn();

  await contexto.queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
  try {
    return await fn();
  } finally {
    await contexto.queryRunner.query(`SELECT set_config('app.bypass_rls', '', true)`);
  }
}
