import { AsyncLocalStorage } from 'node:async_hooks';
import { AppDataSource } from './data-source';
import { HttpError } from '../utils/http-error';
import { logger } from '../utils/logger';
import type { EntityManager, QueryRunner } from 'typeorm';

/**
 * Contexto multi-empresa de una petición. Vive en un `AsyncLocalStorage` para que cualquier
 * repositorio o service pueda saber a qué empresa pertenece la petición en curso sin tener
 * que arrastrar el `empresaId` por la firma de cada función (serían decenas de firmas, y un
 * solo olvido sería una fuga de datos entre clientes).
 */
export interface ContextoTenant {
  /** Empresa dueña de los datos. `null` mientras la petición todavía no se autenticó (login)
   * o en una operación deliberadamente transversal del proveedor. Se conserva SIEMPRE, incluso
   * después de `confirmarTransaccionDeLaPeticion()`: es metadato, no una conexión — código
   * posterior (ej. `ejecutarEnTransaccionPropia`) todavía lo necesita para abrir su propia
   * transacción con el `app.empresa_id` correcto. */
  empresaId: string | null;
  /**
   * `EntityManager` de la transacción de esta petición — la única conexión donde está
   * seteado `app.empresa_id`, y por lo tanto la única donde las políticas RLS de Postgres
   * dejan ver algo. Todo acceso a datos de la petición tiene que pasar por aquí.
   *
   * **`null` una vez que la transacción ya se confirmó** (al final de la petición, o
   * anticipadamente vía `confirmarTransaccionDeLaPeticion()`): la conexión ya se liberó y
   * volvió al pool, así que ya no hay ningún manager seguro que usar. `tenantRepository()`
   * (`tenant-repository.ts`) y `enTransaccion()` (más abajo) lanzan explícitamente en vez de
   * caer a `AppDataSource.manager` (sin `app.empresa_id`, sin RLS) cuando esto es `null` pero
   * SÍ existe un contexto — la única forma segura de seguir accediendo a datos después de
   * ese punto es `ejecutarEnTransaccionPropia`, con su propia conexión nueva.
   */
  manager: EntityManager | null;
  /** Mismo ciclo de vida que `manager`: `null` una vez confirmada la transacción. */
  queryRunner: QueryRunner | null;
  /** Callbacks en espera de que la transacción de la petición se confirme — ver `alConfirmar`
   * más abajo. `middlewares/tenant.middleware.ts` es quien los dispara. */
  pendientesTrasConfirmar: Array<() => void>;
  /**
   * Puesto por `middlewares/tenant.middleware.ts`: confirma la transacción de la petición
   * ANTES de que termine (commit anticipado), reutilizando la misma máquina de cierre que
   * gobierna la respuesta HTTP normal. `confirmarTransaccionDeLaPeticion()` es la única
   * llamadora legítima. `undefined` fuera de una petición HTTP real (scripts, la propia
   * `ejecutarEnTransaccionPropia`), donde no existe ningún "más tarde" que anticipar.
   */
  confirmarAhora?: () => Promise<boolean>;
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
 * Fuera de una petición (scripts, pruebas) abre una transacción propia, como antes. Dentro de
 * una petición cuya transacción ya se confirmó anticipadamente (`manager === null`), lanza en
 * vez de intentar usar un manager inexistente o caer silenciosamente a una conexión sin
 * `app.empresa_id` — ver `ContextoTenant.manager`.
 */
export async function enTransaccion<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
  const contexto = almacen.getStore();
  if (!contexto) return AppDataSource.transaction(fn);
  if (!contexto.manager) {
    throw new HttpError(
      500,
      'La transacción de esta petición ya fue confirmada; usa ejecutarEnTransaccionPropia para seguir escribiendo datos',
    );
  }
  return fn(contexto.manager);
}

/**
 * Núcleo compartido de `ejecutarFueraDeLaPeticion` y `ejecutarEnTransaccionPropia`: abre una
 * conexión propia, fija `app.empresa_id`, corre `fn` en un contexto ALS nuevo (no el de la
 * petición exterior, si la hay) y confirma. Ninguna de las dos funciones públicas duplica esta
 * lógica — solo difieren en su documentación y en cuándo es legítimo llamarlas.
 *
 * **Un fallo de `release()` después de un COMMIT exitoso nunca hace que esta función lance ni
 * pierda el resultado** — misma semántica que H09 ("commit confirmado > fallo de release"):
 * el `release()` del camino exitoso se saca del `try/catch` que decide qué propagar, así que
 * un resultado ya durable en Postgres siempre se devuelve, aunque devolver la conexión al pool
 * de la aplicación haya fallado (se registra, no se oculta, pero no cambia el resultado).
 *
 * **Lifecycle robusto de principio a fin.** `connect()` y `startTransaction()` viven DENTRO
 * del mismo `try` que todo lo demás (antes no era así: si `startTransaction()` fallaba después
 * de un `connect()` exitoso, la conexión nunca se liberaba — un `QueryRunner` real, tomado del
 * pool, quedaba huérfano para siempre). El único chequeo relevante para decidir si intentar un
 * `rollbackTransaction()` es `queryRunner.isTransactionActive` (la misma señal que ya usa
 * `tenant.middleware.ts: cerrar()`): si `connect()` mismo falló, nunca llegó a ponerse en
 * `true`; si `startTransaction()` falló después de marcarlo (TypeORM lo fija ANTES de emitir
 * el `START TRANSACTION` real — ver `PostgresQueryRunner.startTransaction`), intentar un
 * rollback ahí es inofensivo: sobre una conexión rota vuelve a fallar (atrapado aparte, sin
 * enmascarar el error original) y sobre una conexión sana sin transacción real Postgres lo
 * trata como no-op. `release()` sí es seguro llamarlo siempre, incluso si `connect()` nunca
 * tuvo éxito (`releasePostgresConnection` de TypeORM solo actúa si había un callback de
 * liberación real que invocar).
 */
async function ejecutarConConexionPropia<T>(
  empresaId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const queryRunner = AppDataSource.createQueryRunner();
  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();
    await queryRunner.query(`SELECT set_config('app.empresa_id', $1, true)`, [empresaId]);
    const resultado = await almacen.run(
      { empresaId, manager: queryRunner.manager, queryRunner, pendientesTrasConfirmar: [] },
      fn,
    );
    await queryRunner.commitTransaction();
    // El COMMIT ya tuvo éxito acá: un fallo de release() no puede convertir un resultado
    // durable en una excepción — por eso este `release()` está deliberadamente FUERA del
    // `catch` de abajo (nunca reelanza) y el `return` ocurre después, sin pasar por él.
    await liberarConexionPropia(queryRunner, empresaId);
    return resultado;
  } catch (error) {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction().catch((errorRollback: unknown) => {
        logger.error('No se pudo revertir una transacción propia tras un error', errorRollback, {
          empresaId,
        });
      });
    }
    await liberarConexionPropia(queryRunner, empresaId);
    throw error;
  }
}

/** `release()` nunca debe enmascarar el error causal que está por propagarse (ni, en el
 * camino exitoso, el resultado ya durable que está por devolverse) — por eso siempre atrapa su
 * propio fallo acá y nunca lo relanza. */
async function liberarConexionPropia(queryRunner: QueryRunner, empresaId: string): Promise<void> {
  await queryRunner.release().catch((errorRelease: unknown) => {
    logger.error('No se pudo liberar el QueryRunner de una transacción propia', errorRelease, {
      empresaId,
    });
  });
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
 * su transacción (`enTransaccion`), o, si necesita confirmar de forma independiente al resto
 * de la petición, en `ejecutarEnTransaccionPropia`.
 */
export async function ejecutarFueraDeLaPeticion<T>(
  empresaId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return ejecutarConConexionPropia(empresaId, fn);
}

/**
 * Ejecuta `fn` en una conexión **propia**, con su propia transacción y su propia empresa —
 * pensada para trabajo que debe confirmar de forma **independiente** de la transacción de la
 * petición, llamado **durante** la petición (a diferencia de `ejecutarFueraDeLaPeticion`, que
 * es exclusivamente para después de responder).
 *
 * Caso de uso previsto (H13): después de `confirmarTransaccionDeLaPeticion()` —con la
 * transacción de la petición ya cerrada y sin ninguna conexión Postgres abierta mientras se
 * espera una llamada de red externa (ej. al OSE)— el resultado de esa llamada se registra acá,
 * en una transacción corta y nueva, sin reabrir ni depender de la transacción original.
 *
 * Dentro de `fn`, `tenantRepository`/`enTransaccion`/etc. resuelven contra ESTA conexión (el
 * `almacen.run` de `ejecutarConConexionPropia` reemplaza el contexto ALS mientras `fn` corre),
 * nunca contra la de la petición exterior ni contra `AppDataSource.manager` sin RLS. Al
 * terminar `fn`, el contexto ALS exterior (cerrado o no) queda exactamente como estaba antes
 * de esta llamada — `AsyncLocalStorage.run` restaura el contexto anterior por diseño de Node,
 * sin necesidad de código adicional acá.
 *
 * Nunca fire-and-forget: quien llama debe `await` esta función: su resultado (o su excepción)
 * es la única fuente de verdad sobre si el trabajo quedó confirmado.
 */
export async function ejecutarEnTransaccionPropia<T>(
  empresaId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return ejecutarConConexionPropia(empresaId, fn);
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
 * "después del commit" que esperar: se ejecuta de inmediato. **Lo mismo aplica si la
 * transacción de la petición ya se confirmó** (anticipadamente o no): la condición que este
 * callback espera ("ya es durable") ya se cumplió, así que corre de inmediato en vez de
 * encolarse — encolarlo en `pendientesTrasConfirmar` en ese punto nunca se drenaría, porque
 * nadie vuelve a recorrer esa cola después de que `cerrar()` (en `tenant.middleware.ts`) ya
 * la consumió una vez.
 *
 * **Limitación preexistente, conocida, no resuelta acá:** la firma es `fn: () => void`
 * (síncrono) a propósito — el bucle que drena `pendientesTrasConfirmar` (en `cerrar()`) no
 * espera ninguna promesa que `fn` pudiera devolver. Nada impide, a nivel de tipos, pasar un
 * `async () => {...}`: TypeScript acepta una función que retorna `Promise<void>` donde se
 * espera `() => void` (el valor de retorno simplemente se ignora), así que si alguien lo
 * hiciera, esa promesa quedaría flotando sin `await` ni manejo de rechazo. Los dos usos que
 * existen hoy (`comanda.service.ts`, `notificacion.service.ts`) son síncronos y no llaman a
 * ningún repositorio dentro del callback, así que no ejercitan este caso. No se amplía el
 * alcance de esta función para resolverlo — queda documentado como limitación conocida.
 */
export function alConfirmar(fn: () => void): void {
  const contexto = almacen.getStore();
  if (!contexto || !contexto.manager) {
    fn();
    return;
  }
  contexto.pendientesTrasConfirmar.push(fn);
}

export function contextoActual(): ContextoTenant | undefined {
  return almacen.getStore();
}

/** `EntityManager` de la petición en curso, o `null` fuera de una (arranque, migraciones,
 * scripts) **o** si la transacción de la petición ya se confirmó. Los repositorios
 * (`tenant-repository.ts`) distinguen estos dos casos de `null` consultando `contextoActual()`
 * directamente, porque solo el segundo debe lanzar en vez de caer a `AppDataSource.manager`. */
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
 *
 * Se llama siempre al principio de la petición (`requireAuth`/login/demo/carta pública), antes
 * de que exista la posibilidad de un commit anticipado — el `queryRunner` de la petición
 * todavía tiene que estar activo en ese punto. El chequeo explícito de abajo solo existe
 * porque `ContextoTenant.queryRunner` pasó a ser nullable (ver H13); no representa un camino
 * alcanzable hoy.
 */
export async function establecerEmpresaDeLaPeticion(empresaId: string): Promise<void> {
  const contexto = almacen.getStore();
  if (!contexto) {
    throw new HttpError(500, 'No hay transacción de petición activa');
  }
  if (!contexto.queryRunner) {
    throw new HttpError(500, 'La transacción de esta petición ya fue confirmada');
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
 * puede escaparse a otra petición ni quedarse pegado en la conexión. Si la transacción de la
 * petición ya se confirmó (`queryRunner === null`), no hay ninguna conexión segura donde
 * aplicar el bypass — lanza en vez de intentarlo.
 */
export async function conBypassRls<T>(fn: () => Promise<T>): Promise<T> {
  const contexto = almacen.getStore();
  if (!contexto) return fn();
  if (!contexto.queryRunner) {
    throw new HttpError(
      500,
      'La transacción de esta petición ya fue confirmada; no hay conexión activa para el bypass de RLS',
    );
  }

  await contexto.queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
  try {
    return await fn();
  } finally {
    await contexto.queryRunner.query(`SELECT set_config('app.bypass_rls', '', true)`);
  }
}

/**
 * Confirma la transacción de la petición ANTES de que termine ("commit anticipado"),
 * reutilizando la misma máquina de cierre (`cerrar()`, en `tenant.middleware.ts`) que
 * gobierna la respuesta HTTP normal — nunca una segunda implementación de
 * commit/rollback/release.
 *
 * Pensado para H13: una vez que el trabajo que debe ser durable independientemente de lo que
 * ocurra después en la misma petición (ej. "preparar" un comprobante antes de llamar al OSE)
 * ya está escrito, esta función lo confirma de inmediato, libera la conexión, y deja el
 * contexto marcado como cerrado (`manager`/`queryRunner` en `null`) — cualquier código que
 * corra después en la misma petición y necesite seguir tocando datos debe usar
 * `ejecutarEnTransaccionPropia`, nunca asumir que `tenantRepository` sigue funcionando.
 *
 * Si el commit falla, lanza — quien llama nunca debe continuar (ej. llamar a un servicio
 * externo) creyendo que el trabajo previo quedó guardado. `res.end()`, cuando finalmente se
 * llame, no vuelve a intentar ningún commit/rollback: envía la respuesta que el controlador o
 * el manejador de errores hayan decidido, tal cual.
 */
export async function confirmarTransaccionDeLaPeticion(): Promise<void> {
  const contexto = almacen.getStore();
  if (!contexto?.confirmarAhora) {
    throw new HttpError(500, 'No hay una transacción de petición que confirmar anticipadamente');
  }
  const confirmada = await contexto.confirmarAhora();
  if (!confirmada) {
    throw new HttpError(500, 'No se pudo confirmar la operación');
  }
}
