import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDataSource } from '../src/database/data-source';
import { app } from '../src/app';
import { transaccionPorPeticionMiddleware } from '../src/middlewares/tenant.middleware';
import { errorHandlerMiddleware } from '../src/middlewares/error-handler.middleware';
import { confirmarTransaccionDeLaPeticion, alConfirmar } from '../src/database/tenant-context';
import { api, crearEmpresaDePrueba, ADMIN_INICIAL } from './ayudantes';
import type { QueryRunner } from 'typeorm';
import type { Response as ExpressResponse } from 'express';

/**
 * H09 — un COMMIT fallido no puede terminar enviando al cliente el 2xx que el controlador ya
 * había preparado. `tenant.middleware.ts` confirma la transacción de toda la petición recién
 * al interceptar `res.end`; antes de este fix, un fallo de `commitTransaction()` solo se
 * registraba con `logger.error` y la respuesta de éxito salía igual (comprobado en la ronda
 * RED de esta implementación, revirtiendo temporalmente el archivo del fix).
 *
 * Todas las inyecciones de fallo usan el mismo patrón que ya existe en
 * `cocina-tiempo-real.test.ts` (H01-R12): `vi.spyOn(AppDataSource, 'createQueryRunner')`
 * envolviendo el `QueryRunner` real que devuelve la implementación original, nunca un mock
 * completo — así el `startTransaction`, las escrituras reales vía `manager` y el `release`
 * siguen corriendo contra el Postgres real de pruebas.
 */

let espiaActivo: ReturnType<typeof vi.spyOn> | null = null;

afterEach(() => {
  espiaActivo?.mockRestore();
  espiaActivo = null;
});

interface FallaComoRastro {
  commitLlamado: boolean;
  rollbackLlamado: boolean;
  releaseLlamado: boolean;
  /** Cuántas veces se llamó realmente cada paso — `commitLlamado`/etc. arriba solo dicen "al
   * menos una vez"; estos conteos permiten afirmar "exactamente una vez" (T-A03). */
  vecesCommit: number;
  vecesRollback: number;
  vecesRelease: number;
}

/**
 * Hace fallar exactamente el `commitTransaction()` de la PRÓXIMA petición que abra una
 * transacción — simula el modo de fallo real más alcanzable (una desconexión de Postgres en
 * el instante del commit): la propia llamada rechaza, sin que la conexión física siga viva
 * después (igual que un `client.query('COMMIT')` sobre un socket caído). No se relanza el
 * error original de Postgres en la respuesta.
 */
function fallarProximoCommit(rastro: Partial<FallaComoRastro> = {}): void {
  const original = AppDataSource.createQueryRunner.bind(AppDataSource);
  espiaActivo = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementationOnce(() => {
    const queryRunner = original();
    const rollbackOriginal = queryRunner.rollbackTransaction.bind(queryRunner);
    const releaseOriginal = queryRunner.release.bind(queryRunner);

    queryRunner.commitTransaction = (async () => {
      rastro.commitLlamado = true;
      rastro.vecesCommit = (rastro.vecesCommit ?? 0) + 1;
      throw new Error('Fallo de commit inyectado por el test (simulación de corte con Postgres)');
    }) as QueryRunner['commitTransaction'];

    queryRunner.rollbackTransaction = (async () => {
      rastro.rollbackLlamado = true;
      rastro.vecesRollback = (rastro.vecesRollback ?? 0) + 1;
      return rollbackOriginal();
    }) as QueryRunner['rollbackTransaction'];

    queryRunner.release = (async () => {
      rastro.releaseLlamado = true;
      rastro.vecesRelease = (rastro.vecesRelease ?? 0) + 1;
      return releaseOriginal();
    }) as QueryRunner['release'];

    return queryRunner;
  });
}

/** Hace fallar la PRIMERA llamada a `release()` de la próxima petición, DESPUÉS de que su
 * commit real (si lo hay) haya terminado con éxito — para T05. Llamadas posteriores delegan
 * al `release()` real: replicar un fallo transitorio de una sola vez, no dejar el
 * `QueryRunner` inutilizable para siempre — si no, TypeORM sigue teniéndolo por liberar (no
 * llegó a desregistrarse) y lo vuelve a intentar en `AppDataSource.destroy()` al final de la
 * suite, rompiendo el teardown por una razón ajena a lo que este test verifica. */
function fallarProximoRelease(): void {
  const original = AppDataSource.createQueryRunner.bind(AppDataSource);
  espiaActivo = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementationOnce(() => {
    const queryRunner = original();
    const releaseOriginal = queryRunner.release.bind(queryRunner);
    let primeraLlamada = true;
    queryRunner.release = (async () => {
      if (primeraLlamada) {
        primeraLlamada = false;
        throw new Error('Fallo de release inyectado por el test');
      }
      return releaseOriginal();
    }) as QueryRunner['release'];
    return queryRunner;
  });
}

/** Hace fallar el `rollbackTransaction()` de la próxima petición — para T04. */
function fallarProximoRollback(): void {
  const original = AppDataSource.createQueryRunner.bind(AppDataSource);
  espiaActivo = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementationOnce(() => {
    const queryRunner = original();
    queryRunner.rollbackTransaction = (async () => {
      throw new Error('Fallo de rollback inyectado por el test');
    }) as QueryRunner['rollbackTransaction'];
    return queryRunner;
  });
}

/**
 * Deja el `commitTransaction()` de la próxima petición suspendido hasta que el test decida
 * liberarlo — para T08. `llegoACommit` se resuelve justo cuando la ejecución real entra a
 * `commitTransaction()` (antes de esperar la barrera), así el test sabe con certeza que
 * `cerrar()` ya está en curso y el COMMIT está pendiente, sin depender de ningún `sleep`.
 */
function commitControlado(): { liberar: () => void; llegoACommit: Promise<void> } {
  let liberar!: () => void;
  const barrera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let resolverLlego!: () => void;
  const llegoACommit = new Promise<void>((resolve) => {
    resolverLlego = resolve;
  });

  const original = AppDataSource.createQueryRunner.bind(AppDataSource);
  espiaActivo = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementationOnce(() => {
    const queryRunner = original();
    const commitOriginal = queryRunner.commitTransaction.bind(queryRunner);
    queryRunner.commitTransaction = (async () => {
      resolverLlego();
      await barrera;
      return commitOriginal();
    }) as QueryRunner['commitTransaction'];
    return queryRunner;
  });

  return { liberar, llegoACommit };
}

interface ContadoresCierre {
  commits: number;
  rollbacks: number;
  releases: number;
}

/**
 * Espía la PRÓXIMA petición que abra una transacción, sin fallar nada — solo cuenta cuántas
 * veces se llama realmente a `commitTransaction`/`rollbackTransaction`/`release` en esa
 * conexión concreta. Para H13-A: verificar que un commit anticipado confirma exactamente una
 * vez y que `res.end()` posterior no repite ningún paso de la máquina de cierre.
 */
function contarCierre(): ContadoresCierre {
  const contadores: ContadoresCierre = { commits: 0, rollbacks: 0, releases: 0 };
  const original = AppDataSource.createQueryRunner.bind(AppDataSource);
  espiaActivo = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementationOnce(() => {
    const queryRunner = original();
    const commitOriginal = queryRunner.commitTransaction.bind(queryRunner);
    const rollbackOriginal = queryRunner.rollbackTransaction.bind(queryRunner);
    const releaseOriginal = queryRunner.release.bind(queryRunner);
    queryRunner.commitTransaction = (async () => {
      contadores.commits += 1;
      return commitOriginal();
    }) as QueryRunner['commitTransaction'];
    queryRunner.rollbackTransaction = (async () => {
      contadores.rollbacks += 1;
      return rollbackOriginal();
    }) as QueryRunner['rollbackTransaction'];
    queryRunner.release = (async () => {
      contadores.releases += 1;
      return releaseOriginal();
    }) as QueryRunner['release'];
    return queryRunner;
  });
  return contadores;
}

/**
 * Combina `commitControlado` (barrera) con `contarCierre` (conteo real) en un solo espía —
 * necesario porque ambos usan el mismo `mockImplementationOnce` y no pueden coexistir por
 * separado sobre la misma petición. Para T-A18: verificar que un `close` durante CERRANDO no
 * duplica ningún paso de la máquina de cierre.
 */
function commitControladoConContadores(): {
  liberar: () => void;
  llegoACommit: Promise<void>;
  contadores: ContadoresCierre;
} {
  const contadores: ContadoresCierre = { commits: 0, rollbacks: 0, releases: 0 };
  let liberar!: () => void;
  const barrera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let resolverLlego!: () => void;
  const llegoACommit = new Promise<void>((resolve) => {
    resolverLlego = resolve;
  });

  const original = AppDataSource.createQueryRunner.bind(AppDataSource);
  espiaActivo = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementationOnce(() => {
    const queryRunner = original();
    const commitOriginal = queryRunner.commitTransaction.bind(queryRunner);
    const rollbackOriginal = queryRunner.rollbackTransaction.bind(queryRunner);
    const releaseOriginal = queryRunner.release.bind(queryRunner);
    queryRunner.commitTransaction = (async () => {
      resolverLlego();
      await barrera;
      contadores.commits += 1;
      return commitOriginal();
    }) as QueryRunner['commitTransaction'];
    queryRunner.rollbackTransaction = (async () => {
      contadores.rollbacks += 1;
      return rollbackOriginal();
    }) as QueryRunner['rollbackTransaction'];
    queryRunner.release = (async () => {
      contadores.releases += 1;
      return releaseOriginal();
    }) as QueryRunner['release'];
    return queryRunner;
  });

  return { liberar, llegoACommit, contadores };
}

/**
 * Igual que `commitControlado`, pero el `commitTransaction()` suspendido en la barrera
 * termina FALLANDO (en vez de completarse) al liberarla — para T-A17: el commit anticipado
 * está en curso (CERRANDO) y termina rechazando.
 */
function commitControladoQueFalla(rastro: Partial<FallaComoRastro> = {}): {
  liberar: () => void;
  llegoACommit: Promise<void>;
} {
  let liberar!: () => void;
  const barrera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let resolverLlego!: () => void;
  const llegoACommit = new Promise<void>((resolve) => {
    resolverLlego = resolve;
  });

  const original = AppDataSource.createQueryRunner.bind(AppDataSource);
  espiaActivo = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementationOnce(() => {
    const queryRunner = original();
    const rollbackOriginal = queryRunner.rollbackTransaction.bind(queryRunner);
    const releaseOriginal = queryRunner.release.bind(queryRunner);
    queryRunner.commitTransaction = (async () => {
      resolverLlego();
      await barrera;
      rastro.commitLlamado = true;
      rastro.vecesCommit = (rastro.vecesCommit ?? 0) + 1;
      throw new Error('Fallo de commit inyectado por el test (T-A17, tras liberar la barrera)');
    }) as QueryRunner['commitTransaction'];
    queryRunner.rollbackTransaction = (async () => {
      rastro.rollbackLlamado = true;
      rastro.vecesRollback = (rastro.vecesRollback ?? 0) + 1;
      return rollbackOriginal();
    }) as QueryRunner['rollbackTransaction'];
    queryRunner.release = (async () => {
      rastro.releaseLlamado = true;
      rastro.vecesRelease = (rastro.vecesRelease ?? 0) + 1;
      return releaseOriginal();
    }) as QueryRunner['release'];
    return queryRunner;
  });

  return { liberar, llegoACommit };
}

/** Arnés mínimo con el middleware REAL de producción, para las pruebas de H13-A que llaman a
 * `confirmarTransaccionDeLaPeticion()` directamente desde una ruta de prueba (todavía no hay
 * ningún código de negocio real que la use — esa es la fase siguiente). */
function appConfirmacionAnticipada(
  manejador: (req: express.Request, res: express.Response) => Promise<void>,
): express.Express {
  const appDePrueba = express();
  appDePrueba.use('/api', transaccionPorPeticionMiddleware);
  appDePrueba.get('/api/harness-anticipado', (req, res, next) => {
    manejador(req, res).catch(next);
  });
  appDePrueba.use(errorHandlerMiddleware);
  return appDePrueba;
}

async function crearCategoria(sesion: Awaited<ReturnType<typeof crearEmpresaDePrueba>>, nombre: string) {
  return api.post('/api/categorias', sesion, { nombre });
}

async function existeCategoria(
  sesion: Awaited<ReturnType<typeof crearEmpresaDePrueba>>,
  nombre: string,
): Promise<boolean> {
  const lista = await api.get('/api/categorias', sesion).expect(200);
  return (lista.body.data as Array<{ nombre: string }>).some((c) => c.nombre === nombre);
}

describe('H09 — commit fallido no puede devolver una respuesta exitosa', () => {
  it('T01 — commit exitoso: respuesta normal y persistencia real', async () => {
    const sesion = await crearEmpresaDePrueba();
    const nombre = `H09-T01-${Date.now()}`;

    const respuesta = await crearCategoria(sesion, nombre);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.success).toBe(true);
    expect(await existeCategoria(sesion, nombre)).toBe(true);
  });

  it('T02 — commit falla: el cliente nunca recibe 2xx, la fila no queda persistida, y los headers son los del error (RED→GREEN de H09)', async () => {
    const sesion = await crearEmpresaDePrueba();
    const nombre = `H09-T02-${Date.now()}`;
    const rastro: Partial<FallaComoRastro> = {};
    fallarProximoCommit(rastro);

    const respuesta = await crearCategoria(sesion, nombre);

    // El comportamiento vulnerable (comprobado en la ronda RED de esta sesión, revirtiendo
    // temporalmente el fix) era exactamente `respuesta.status === 201` con la fila ausente:
    // un "éxito fantasma". Acá se exige lo contrario.
    expect(respuesta.status).toBe(500);
    expect(respuesta.body.success).toBe(false);
    // Nunca se expone el motivo interno de Postgres/TypeORM al cliente.
    expect(respuesta.body.message).not.toMatch(/postgres|commit|inyectado|query/i);
    expect(rastro.commitLlamado).toBe(true);

    expect(await existeCategoria(sesion, nombre)).toBe(false);

    // Headers de la respuesta de error sustituta (Bloqueante 2): tienen que describir el
    // body de error que realmente se envió, no arrastrar nada de la respuesta de éxito
    // abortada.
    expect(respuesta.headers['content-type']).toMatch(/^application\/json/);
    expect(Number(respuesta.headers['content-length'])).toBe(
      Buffer.byteLength(respuesta.text, 'utf8'),
    );
  });

  it('T02b — commit falla: un ETag/Location deliberadamente puestos para el éxito no sobreviven al error', async () => {
    // Este backend no usa `Location` hoy (verificado por búsqueda en el análisis previo) —
    // arnés mínimo permitido explícitamente para probar el mecanismo de limpieza de headers
    // de forma genérica, sin modificar ninguna ruta productiva.
    const appDePrueba = express();
    appDePrueba.use('/api', transaccionPorPeticionMiddleware);
    appDePrueba.get('/api/harness-headers', (_req, res) => {
      res.set('ETag', '"exito-original"');
      res.set('Location', '/recurso/original');
      res.status(201).json({ success: true, mensaje: 'no debería llegar al cliente' });
    });
    appDePrueba.use(errorHandlerMiddleware);

    fallarProximoCommit();
    const respuesta = await request(appDePrueba).get('/api/harness-headers');

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.success).toBe(false);
    expect(respuesta.headers.location).toBeUndefined();
    expect(respuesta.headers.etag).not.toBe('"exito-original"');
    expect(respuesta.headers['content-type']).toMatch(/^application\/json/);
    expect(Number(respuesta.headers['content-length'])).toBe(
      Buffer.byteLength(respuesta.text, 'utf8'),
    );
  });

  it('T02c — commit falla en /api/auth/login: la cookie de sesión de éxito no sobrevive al error', async () => {
    // Prueba con el único header funcional de éxito que este backend realmente usa hoy
    // (`res.cookie(REFRESH_COOKIE, ...)` en login/refrescar/alta de demo) — no un header
    // sintético.
    const normal = await request(app).post('/api/auth/login').send(ADMIN_INICIAL);
    expect(normal.status).toBe(200);
    const cookiesDeExito = ([] as string[]).concat(
      (normal.headers['set-cookie'] as unknown as string | string[] | undefined) ?? [],
    );
    expect(cookiesDeExito.some((c) => c.startsWith('refresh_token='))).toBe(true);

    fallarProximoCommit();
    const conFallo = await request(app).post('/api/auth/login').send(ADMIN_INICIAL);

    expect(conFallo.status).toBe(500);
    expect(conFallo.body.success).toBe(false);
    expect(conFallo.headers['set-cookie']).toBeUndefined();
  });

  it('T03 — respuesta de negocio >=400 conserva su contrato (rollback normal, sin cambios)', async () => {
    const sesion = await crearEmpresaDePrueba();

    // `nombre` vacío: rechazado por `crearCategoriaSchema` antes de tocar la base.
    const respuesta = await crearCategoria(sesion, '');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.success).toBe(false);
  });

  it('T04 — rollback falla en una respuesta de error: una sola respuesta, nunca éxito', async () => {
    const sesion = await crearEmpresaDePrueba();
    fallarProximoRollback();

    // Mismo caso de T03 (400 por validación) pero con el rollback posterior fallando.
    const respuesta = await crearCategoria(sesion, '');

    // Supertest solo resuelve si recibió una respuesta HTTP bien formada y única; una doble
    // llamada real a `res.end`/`ERR_STREAM_WRITE_AFTER_END` habría producido un error de
    // conexión acá en vez de un body coherente.
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.success).toBe(false);
  });

  it('T05 — release falla tras un commit exitoso: la operación sigue siendo un éxito', async () => {
    const sesion = await crearEmpresaDePrueba();
    const nombre = `H09-T05-${Date.now()}`;
    fallarProximoRelease();

    const respuesta = await crearCategoria(sesion, nombre);

    // El commit YA ocurrió en Postgres — fallar al devolver la conexión al pool es un
    // problema de recursos de la aplicación, no debe convertir una operación durable en 500.
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.success).toBe(true);
    expect(await existeCategoria(sesion, nombre)).toBe(true);
  });

  it('T06 — un error del controller/service antes de responder sigue yendo al error middleware', async () => {
    const sesion = await crearEmpresaDePrueba();

    const respuesta = await api.get(
      '/api/categorias/00000000-0000-0000-0000-000000000000',
      sesion,
    );

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.success).toBe(false);
  });

  it('T07 — respuesta 204: commit exitoso la conserva, commit fallido la convierte en 500', async () => {
    // No existe ningún endpoint 204 en el backend real (confirmado por búsqueda en el
    // análisis previo) — se monta un arnés mínimo con el middleware REAL de producción sobre
    // una ruta de prueba dedicada, para no fabricar cobertura sobre un endpoint que no existe.
    const appDePrueba = express();
    appDePrueba.use('/api', transaccionPorPeticionMiddleware);
    appDePrueba.get('/api/sin-contenido', (_req, res) => {
      res.status(204).end();
    });
    appDePrueba.use(errorHandlerMiddleware);

    const ok = await request(appDePrueba).get('/api/sin-contenido');
    expect(ok.status).toBe(204);

    fallarProximoCommit();
    const falla = await request(appDePrueba).get('/api/sin-contenido');
    expect(falla.status).toBe(500);
    expect(falla.body.success).toBe(false);
  });

  it('T08a — reentrada de res.end (commit falla → sendError → res.end interceptado) envía una sola respuesta real', async () => {
    const sesion = await crearEmpresaDePrueba();
    const nombre = `H09-T08-${Date.now()}`;
    fallarProximoCommit();

    const respuesta = await crearCategoria(sesion, nombre);
    expect(respuesta.status).toBe(500);

    // El servidor no quedó en un estado roto por la reentrada: la siguiente petición,
    // completamente normal, sigue funcionando (mismo criterio que H01-R12 en
    // cocina-tiempo-real.test.ts).
    const siguiente = await crearCategoria(sesion, `${nombre}-siguiente`);
    expect(siguiente.status).toBe(201);
  });

  it('T08b — una segunda llamada a res.end mientras el COMMIT sigue pendiente no envía bytes; al resolver, ocurre exactamente un envío real (Bloqueante 1)', async () => {
    let resCapturada: import('express').Response | null = null;
    const appDePrueba = express();
    appDePrueba.use('/api', transaccionPorPeticionMiddleware);
    appDePrueba.get('/api/harness-doble-end', (_req, res) => {
      resCapturada = res;
      res.status(201).json({ success: true, intento: 'primero' });
    });
    appDePrueba.use(errorHandlerMiddleware);

    const { liberar, llegoACommit } = commitControlado();
    const peticion = request(appDePrueba).get('/api/harness-doble-end');
    // `supertest`/`superagent` no despacha la petición hasta que algo la consuma como
    // promesa (`.then()`/`await`) — sin esto, `peticion` queda armada pero nunca enviada
    // hasta la primera espera más abajo, y `llegoACommit` no resolvería nunca.
    void peticion.then(
      () => undefined,
      () => undefined,
    );

    // Espera determinista (sin sleep): se resuelve justo cuando la ejecución real entra a
    // `commitTransaction()`, es decir, cuando `cerrar()` ya arrancó y el COMMIT está
    // suspendido en la barrera controlada por este test.
    await llegoACommit;

    // Ningún envío real todavía: se corrobora ganándole la carrera a la propia petición con
    // un timeout corto — si ya hubiera una respuesta lista, `Promise.race` la devolvería en
    // vez de agotar el plazo.
    const primeraCarrera = await Promise.race([
      peticion.then(() => 'llego-respuesta' as const),
      new Promise<'todavia-nada'>((resolver) => setTimeout(() => resolver('todavia-nada'), 100)),
    ]);
    expect(primeraCarrera).toBe('todavia-nada');

    // Segunda llamada a res.end mientras el COMMIT sigue pendiente — exactamente el escenario
    // que Codex marcó como Bloqueante 1. Con el diseño anterior (un solo booleano `cerrada`),
    // esto habría tomado el atajo de "ya está cerrada" y enviado estos bytes de inmediato,
    // sin esperar el resultado real del commit.
    resCapturada!.end();

    // Sigue sin haber ninguna respuesta real: la segunda llamada, mientras el estado es
    // CERRANDO, no pudo tocar el socket por su cuenta.
    const segundaCarrera = await Promise.race([
      peticion.then(() => 'llego-respuesta' as const),
      new Promise<'todavia-nada'>((resolver) => setTimeout(() => resolver('todavia-nada'), 100)),
    ]);
    expect(segundaCarrera).toBe('todavia-nada');

    liberar();
    const respuesta = await peticion;

    // Exactamente una respuesta real, bien formada, con el body del PRIMER intento (el único
    // autorizado) — si hubiera habido un segundo envío real, Node no podría haber entregado
    // una respuesta HTTP coherente sobre la misma conexión.
    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toEqual({ success: true, intento: 'primero' });
  });

  it('sección 6 — un fallo en el envío real posterior al cierre no deja una Promise rechazada sin manejar', async () => {
    // Parcheo a nivel de INSTANCIA de UNA sola petición (no del prototipo global de
    // `http.ServerResponse`, que en este entorno interactúa mal con el propio mecanismo de
    // espionaje de Vitest sobre sockets HTTP reales y produce una recursión/cuelgue ajena a
    // lo que este test verifica). Un middleware montado ANTES de
    // `transaccionPorPeticionMiddleware` reemplaza `res.end` por una trampa que falla una
    // sola vez — como esa reasignación ocurre antes de que el middleware real capture
    // `enviarOriginal = res.end.bind(res)`, `enviarOriginal` termina siendo la trampa. Así se
    // reproduce, con Postgres real (commit exitoso, sin ningún fallo inyectado), "un error en
    // el camino de envío posterior al cierre" — exactamente lo que pide el Bloqueante 3.
    const appDePrueba = express();
    appDePrueba.use('/api', (_req, res, next) => {
      const nativo = res.end.bind(res) as (...args: unknown[]) => typeof res;
      let primeraLlamada = true;
      res.end = ((...args: unknown[]) => {
        if (primeraLlamada) {
          primeraLlamada = false;
          throw new Error('Fallo simulado en el envío real, posterior al cierre de la transacción');
        }
        return nativo(...args);
      }) as typeof res.end;
      next();
    });
    appDePrueba.use('/api', transaccionPorPeticionMiddleware);
    appDePrueba.get('/api/harness-fallo-post-cierre', (_req, res) => {
      res.status(201).json({ success: true });
    });
    appDePrueba.use(errorHandlerMiddleware);

    const rechazosNoManejados: unknown[] = [];
    const alRechazoNoManejado = (motivo: unknown) => {
      rechazosNoManejados.push(motivo);
    };
    process.on('unhandledRejection', alRechazoNoManejado);

    try {
      const respuesta = await request(appDePrueba).get('/api/harness-fallo-post-cierre');
      // El primer intento de envío real (el del éxito) falló por la trampa; la rama
      // `.catch()` de `interceptada` lo atrapó, lo registró, y reintentó el envío de
      // emergencia — que ya no falla (segunda llamada, ya delegada al `res.end` nativo). El
      // cliente igual recibe una respuesta de error coherente, no una conexión colgada.
      expect(respuesta.status).toBe(500);
      expect(respuesta.body.success).toBe(false);

      // `unhandledRejection` se emite de forma asíncrona; se le da a Node el resto del turno
      // del event loop antes de comprobar que no ocurrió ninguno.
      await new Promise((resolver) => setImmediate(resolver));
      expect(rechazosNoManejados).toEqual([]);
    } finally {
      process.off('unhandledRejection', alRechazoNoManejado);
    }
  });

  it('T09 — tras un commit fallido se intenta un rollback de recuperación, y el pool sigue sano después', async () => {
    const sesion = await crearEmpresaDePrueba();
    const rastro: Partial<FallaComoRastro> = {};
    fallarProximoCommit(rastro);

    const respuestaFallida = await crearCategoria(sesion, `H09-T09-${Date.now()}`);
    expect(respuestaFallida.status).toBe(500);

    // Nivel de decisión (determinista): el middleware SÍ intentó la recuperación.
    // No se pudo reproducir con Postgres real el escenario "COMMIT falla pero la conexión
    // queda viva con la transacción abortada" (se intentó forzarlo con una query inválida
    // dentro de la transacción antes del commit; Postgres/node-postgres trataron ese COMMIT
    // como un ROLLBACK silencioso, sin lanzar — no hay ningún constraint DEFERRABLE en este
    // esquema que sí lo produzca). Por eso este test cubre la decisión del middleware
    // (intenta el rollback de recuperación) y, por separado, que el pool en su conjunto siga
    // respondiendo con normalidad — no que sea exactamente la misma conexión física
    // reciclada, algo que no se puede forzar de forma determinista desde la aplicación.
    expect(rastro.commitLlamado).toBe(true);
    expect(rastro.rollbackLlamado).toBe(true);
    expect(rastro.releaseLlamado).toBe(true);

    const otraEmpresa = await crearEmpresaDePrueba();
    const normal = await crearCategoria(otraEmpresa, `H09-T09-otra-${Date.now()}`);
    expect(normal.status).toBe(201);
  });
});

/**
 * H13-A — infraestructura de "commit anticipado": `confirmarTransaccionDeLaPeticion()` deja
 * confirmada la transacción de la petición ANTES de que `res.end()` se llame, reutilizando la
 * misma máquina de cierre de H09 (`cerrar()`), sin degradarla. Todavía no existe ningún
 * workflow de negocio real que la use (esa es la fase siguiente) — estas pruebas ejercitan la
 * infraestructura directamente, con rutas de arnés mínimas.
 */
describe('H13-A — infraestructura de commit anticipado', () => {
  it('T-A01 — commit anticipado exitoso: commit exactamente una vez', async () => {
    const contadores = contarCierre();
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion();
      res.status(200).json({ ok: true });
    });

    const respuesta = await request(appDePrueba).get('/api/harness-anticipado');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ ok: true });
    expect(contadores.commits).toBe(1);
  });

  it('T-A02 — después del commit anticipado, res.end no produce un segundo commit ni un segundo release', async () => {
    const contadores = contarCierre();
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion();
      // Dos llamadas reales a res.end (json + un end() extra) para forzar el camino de
      // "segunda llamada" del middleware — ninguna de las dos debe tocar commit/release.
      res.status(200).json({ ok: true });
      res.end();
    });

    const respuesta = await request(appDePrueba).get('/api/harness-anticipado');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ ok: true });
    expect(contadores.commits).toBe(1);
    expect(contadores.releases).toBe(1);
  });

  it('T-A03 — commit anticipado falla: commit intentado una vez, rollback de recuperación una vez, release una vez, 500, sin respuesta de éxito previa', async () => {
    const rastro: Partial<FallaComoRastro> = {};
    fallarProximoCommit(rastro);
    let seArmoElExito = false;
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion(); // debe lanzar — nunca llega a lo de abajo
      seArmoElExito = true;
      res.status(200).json({ ok: true });
    });

    const respuesta = await request(appDePrueba).get('/api/harness-anticipado');

    expect(respuesta.status).toBe(500);
    expect(respuesta.body.success).toBe(false);
    // Nunca se llegó a armar el body de éxito: el `throw` de `confirmarTransaccionDeLaPeticion`
    // corta el flujo ANTES de esa línea — no es que se armara y luego se descartara.
    expect(seArmoElExito).toBe(false);
    // commit intentado EXACTAMENTE una vez.
    expect(rastro.vecesCommit).toBe(1);
    // rollback de recuperación intentado EXACTAMENTE una vez (la transacción seguía activa
    // tras el commit fallido — ver `cerrar()` en `tenant.middleware.ts`).
    expect(rastro.vecesRollback).toBe(1);
    // release intentado EXACTAMENTE una vez.
    expect(rastro.vecesRelease).toBe(1);
  });

  it('T-A04 — release falla después de un commit anticipado exitoso: el commit sigue considerado confirmado', async () => {
    fallarProximoRelease();
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion(); // NO debe lanzar: el commit sí tuvo éxito
      res.status(200).json({ ok: true });
    });

    const respuesta = await request(appDePrueba).get('/api/harness-anticipado');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ ok: true });
  });

  it('T-A05 — callback alConfirmar registrado ANTES del commit anticipado corre exactamente una vez', async () => {
    let llamadas = 0;
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      alConfirmar(() => {
        llamadas += 1;
      });
      expect(llamadas).toBe(0); // todavía no confirmó nada
      await confirmarTransaccionDeLaPeticion();
      expect(llamadas).toBe(1); // ya corrió, apenas se confirmó
      res.status(200).json({ ok: true });
    });

    const respuesta = await request(appDePrueba).get('/api/harness-anticipado');

    expect(respuesta.status).toBe(200);
  });

  it('T-A06 — callback alConfirmar registrado DESPUÉS del commit anticipado corre de inmediato, una sola vez', async () => {
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion();
      let llamadas = 0;
      alConfirmar(() => {
        llamadas += 1;
      });
      // Síncrono: si quedara encolado en vez de ejecutarse de inmediato, `llamadas` seguiría
      // en 0 acá (nadie volvería a drenar esa cola nunca).
      expect(llamadas).toBe(1);
      res.status(200).json({ ok: true });
    });

    const respuesta = await request(appDePrueba).get('/api/harness-anticipado');

    expect(respuesta.status).toBe(200);
  });

  it('T-A14 — dos llamadas reales a res.end después del commit anticipado: exactamente un envío real (no solo un body observado por Supertest)', async () => {
    // Supertest/superagent solo entrega el ÚLTIMO body que Node terminó de mandar sobre la
    // conexión — si hubiera habido dos envíos reales concatenados o corruptos, Supertest podría
    // no distinguirlo de un envío único. Por eso acá se cuenta la llamada real al `res.end`
    // NATIVO (parcheado a nivel de INSTANCIA, antes de que `transaccionPorPeticionMiddleware`
    // capture `enviarOriginal` — mismo patrón, ya probado, de `sección 6` en H09; nunca se
    // parchea `http.ServerResponse.prototype` globalmente, que en este entorno interactúa mal
    // con el propio mecanismo de sockets de Vitest).
    let enviosReales = 0;
    let resCapturada: ExpressResponse | null = null;
    const appDePrueba = express();
    appDePrueba.use('/api', (_req, res, next) => {
      const nativo = res.end.bind(res) as (...args: unknown[]) => typeof res;
      res.end = ((...args: unknown[]) => {
        enviosReales += 1;
        return nativo(...args);
      }) as typeof res.end;
      next();
    });
    appDePrueba.use('/api', transaccionPorPeticionMiddleware);
    appDePrueba.get('/api/harness-anticipado', (_req, res, next) => {
      (async () => {
        resCapturada = res;
        await confirmarTransaccionDeLaPeticion();
        res.status(200).json({ ok: true, primero: true });
        // Segunda llamada real, explícita, después de que la primera ya envió — no debe
        // alterar lo que el cliente ya recibió, ni producir un segundo envío real.
        resCapturada!.end();
      })().catch(next);
    });
    appDePrueba.use(errorHandlerMiddleware);

    const respuesta = await request(appDePrueba).get('/api/harness-anticipado');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ ok: true, primero: true });
    expect(enviosReales).toBe(1);
  });

  it('T-A15 — abort del cliente después del commit anticipado: no reintenta rollback ni un segundo release', async () => {
    const contadores = contarCierre();
    let resolverListo!: () => void;
    const listo = new Promise<void>((resolve) => {
      resolverListo = resolve;
    });

    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion();
      // Simula el abort del cliente DESPUÉS del commit anticipado, antes de que esta función
      // termine de responder — mismo evento que dispara `res.on('close')` en producción.
      res.emit('close');
      resolverListo();
      res.status(200).json({ ok: true });
    });

    const peticion = request(appDePrueba).get('/api/harness-anticipado');
    void peticion.then(
      () => undefined,
      () => undefined,
    );
    await peticion;
    await listo;

    // El commit anticipado ya confirmó y liberó; el 'close' simulado, disparado después,
    // encuentra `estado === 'CERRADO'` y no repite nada.
    expect(contadores.commits).toBe(1);
    expect(contadores.rollbacks).toBe(0);
    expect(contadores.releases).toBe(1);
  });

  it('T-A16 — res.end() llamado mientras el commit anticipado sigue EN CURSO (CERRANDO): no envía bytes hasta que el commit resuelve; exactamente una respuesta final (Bloqueante 1)', async () => {
    // Contador de envíos reales a nivel de INSTANCIA (no del prototipo global de
    // `http.ServerResponse` — ver la nota de `sección 6` en H09 sobre por qué eso produce una
    // recursión/cuelgue ajena en este entorno). Montado ANTES de
    // `transaccionPorPeticionMiddleware`, para que `enviarOriginal` (capturado dentro de ese
    // middleware) termine siendo este wrapper.
    let enviosReales = 0;
    let resCapturada: ExpressResponse | null = null;
    const appDePrueba = express();
    appDePrueba.use('/api', (_req, res, next) => {
      const nativo = res.end.bind(res) as (...args: unknown[]) => typeof res;
      res.end = ((...args: unknown[]) => {
        enviosReales += 1;
        return nativo(...args);
      }) as typeof res.end;
      next();
    });
    appDePrueba.use('/api', transaccionPorPeticionMiddleware);
    appDePrueba.get('/api/harness-cerrando', (_req, res, next) => {
      resCapturada = res;
      confirmarTransaccionDeLaPeticion()
        .then(() => res.status(200).json({ ok: true, origen: 'ruta-tras-confirmar' }))
        .catch(next);
    });
    appDePrueba.use(errorHandlerMiddleware);

    const { liberar, llegoACommit } = commitControlado();
    const peticion = request(appDePrueba).get('/api/harness-cerrando');
    void peticion.then(
      () => undefined,
      () => undefined,
    );

    // Se resuelve justo cuando la ejecución real entra a `commitTransaction()` — el commit
    // anticipado ya puso `estado` en CERRANDO, y sigue ahí, suspendido en la barrera.
    await llegoACommit;
    expect(enviosReales).toBe(0);

    // "res.end()" disparado por otra vía (simulando cualquier código que llegara a llamarlo)
    // MIENTRAS el commit anticipado sigue pendiente — exactamente el escenario del
    // Bloqueante 1. Con el defecto que Codex encontró, esto habría enviado de inmediato.
    resCapturada!.status(200).json({ ok: true, origen: 'segunda-llamada-durante-cerrando' });

    // Sigue sin salir nada: el cierre real (la promesa `cierre` compartida) todavía no
    // resolvió — la llamada de arriba debe haber quedado esperándola, no haber mandado bytes.
    expect(enviosReales).toBe(0);

    liberar();
    const respuesta = await peticion;

    // Exactamente un envío real, con el body de la PRIMERA llamada real (la que ocurrió
    // durante CERRANDO) — la de la propia ruta, que llegó después, quedó como no-op.
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual({ ok: true, origen: 'segunda-llamada-durante-cerrando' });
    expect(enviosReales).toBe(1);
  });

  it('T-A17 — éxito preparado mientras el commit anticipado (CERRANDO) TERMINA FALLANDO: nunca se envía el éxito, responde 500, un solo envío real, con recovery rollback y release', async () => {
    const rastro: Partial<FallaComoRastro> = {};
    let enviosReales = 0;
    let resCapturada: ExpressResponse | null = null;
    const appDePrueba = express();
    appDePrueba.use('/api', (_req, res, next) => {
      const nativo = res.end.bind(res) as (...args: unknown[]) => typeof res;
      res.end = ((...args: unknown[]) => {
        enviosReales += 1;
        return nativo(...args);
      }) as typeof res.end;
      next();
    });
    appDePrueba.use('/api', transaccionPorPeticionMiddleware);
    appDePrueba.get('/api/harness-cerrando-falla', (_req, res, next) => {
      resCapturada = res;
      confirmarTransaccionDeLaPeticion()
        .then(() => res.status(200).json({ ok: true }))
        .catch(next);
    });
    appDePrueba.use(errorHandlerMiddleware);

    const { liberar, llegoACommit } = commitControladoQueFalla(rastro);
    const peticion = request(appDePrueba).get('/api/harness-cerrando-falla');
    void peticion.then(
      () => undefined,
      () => undefined,
    );

    await llegoACommit;
    expect(enviosReales).toBe(0);

    // El "éxito" queda preparado (llamado) mientras el commit anticipado sigue pendiente —
    // igual que T-A16, pero acá ese commit va a terminar fallando al liberar la barrera.
    resCapturada!.status(200).json({ ok: true, origen: 'preparado-antes-de-que-falle' });
    expect(enviosReales).toBe(0);

    liberar();
    const respuesta = await peticion;

    // El éxito preparado NUNCA se envió — se sustituyó por un 500 coherente (misma filosofía
    // H09: limpieza de headers ya cubierta por `limpiarHeadersDeExito`, JSON de error genérico,
    // sin detalle interno).
    expect(respuesta.status).toBe(500);
    expect(respuesta.body.success).toBe(false);
    expect(respuesta.body.message).not.toMatch(/postgres|commit|inyectado|query/i);
    expect(enviosReales).toBe(1);

    expect(rastro.vecesCommit).toBe(1);
    expect(rastro.vecesRollback).toBe(1); // recovery rollback, transacción seguía activa
    expect(rastro.vecesRelease).toBe(1);
  });

  it('T-A18 — close() del cliente mientras el commit anticipado sigue EN CURSO (CERRANDO): reutiliza la misma promesa `cierre`, sin rollback/commit/release duplicados', async () => {
    let resCapturada: ExpressResponse | null = null;
    const appDePrueba = express();
    appDePrueba.use('/api', transaccionPorPeticionMiddleware);
    appDePrueba.get('/api/harness-close-cerrando', (_req, res, next) => {
      resCapturada = res;
      confirmarTransaccionDeLaPeticion()
        .then(() => res.status(200).json({ ok: true }))
        .catch(next);
    });
    appDePrueba.use(errorHandlerMiddleware);

    const { liberar, llegoACommit, contadores } = commitControladoConContadores();
    const peticion = request(appDePrueba).get('/api/harness-close-cerrando');
    void peticion.then(
      () => undefined,
      () => undefined,
    );

    await llegoACommit;
    // El commit real sigue suspendido en la barrera: todavía no se contó ningún commit.
    expect(contadores.commits).toBe(0);

    // Simula el abort del cliente MIENTRAS el commit anticipado sigue pendiente — el mismo
    // evento que `res.on('close')` ya escucha en producción.
    resCapturada!.emit('close');

    liberar();
    const respuesta = await peticion;

    // El `close` no disparó ni un rollback concurrente ni un segundo commit/release: todo lo
    // que ocurrió fue el ÚNICO ciclo commit→release del commit anticipado, ya en curso antes
    // de que el `close` llegara. La respuesta final la termina de resolver la propia ruta,
    // cuando `confirmarTransaccionDeLaPeticion()` por fin resuelve.
    expect(respuesta.status).toBe(200);
    expect(contadores.commits).toBe(1);
    expect(contadores.rollbacks).toBe(0);
    expect(contadores.releases).toBe(1);
  });
});
