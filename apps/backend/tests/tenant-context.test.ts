import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { transaccionPorPeticionMiddleware } from '../src/middlewares/tenant.middleware';
import { errorHandlerMiddleware } from '../src/middlewares/error-handler.middleware';
import { AppDataSource } from '../src/database/data-source';
import {
  confirmarTransaccionDeLaPeticion,
  contextoActual,
  ejecutarEnTransaccionPropia,
  ejecutarFueraDeLaPeticion,
  enTransaccion,
  conBypassRls,
} from '../src/database/tenant-context';
import { categoriaRepository } from '../src/modules/categorias/categoria.repository';
import { api, crearEmpresaDePrueba } from './ayudantes';
import type { QueryRunner } from 'typeorm';

let espiaActivo: ReturnType<typeof vi.spyOn> | null = null;
afterEach(() => {
  espiaActivo?.mockRestore();
  espiaActivo = null;
});

/**
 * H13-A — el otro lado de la infraestructura de commit anticipado: qué le pasa al contexto
 * `AsyncLocalStorage` (ALS) una vez que `confirmarTransaccionDeLaPeticion()` ya corrió, y cómo
 * se comporta `ejecutarEnTransaccionPropia` (la transacción corta y propia que una fase
 * FINALIZAR futura usará). `tenant-middleware-commit.test.ts` cubre el lado de `res.end()`;
 * este archivo cubre el lado de `tenant-repository.ts`/`tenant-context.ts`.
 */

function appConfirmacionAnticipada(
  manejador: (req: express.Request, res: express.Response) => Promise<void>,
): express.Express {
  const appDePrueba = express();
  appDePrueba.use('/api', transaccionPorPeticionMiddleware);
  appDePrueba.get('/api/harness-ctx', (req, res, next) => {
    manejador(req, res).catch(next);
  });
  appDePrueba.use(errorHandlerMiddleware);
  return appDePrueba;
}

interface RastroTransaccionPropia {
  vecesConnect: number;
  vecesStartTransaction: number;
  vecesSetConfig: number;
  vecesCommit: number;
  vecesRollback: number;
  vecesRelease: number;
}

interface FallosLifecycle {
  /** Falla la query real `START TRANSACTION` (no `startTransaction()` en sí — así
   * `isTransactionActive` queda en `true` exactamente como lo deja el driver real cuando el
   * `BEGIN` falla, en vez de nunca haberlo tocado). */
  startTransactionSql?: Error;
  setConfig?: Error;
  rollback?: Error;
  commit?: Error;
  release?: Error;
}

/**
 * Espía el lifecycle completo (`connect`/`startTransaction`/`query` de `set_config`/
 * `commitTransaction`/`rollbackTransaction`/`release`) de la PRÓXIMA conexión que abra
 * `ejecutarEnTransaccionPropia`/`ejecutarFueraDeLaPeticion` — para T-A19 a T-A26. Cada fallo
 * inyectado ocurre DESPUÉS de delegar al paso real correspondiente cuando corresponde (para
 * `startTransactionSql`, interceptando la query real de `START TRANSACTION`, no el método
 * `startTransaction()` — así `isTransactionActive` se fija exactamente igual que en el driver
 * real, sin fingir un estado que Postgres/TypeORM no dejarían).
 */
function espiarTransaccionPropia(fallos: FallosLifecycle = {}): {
  rastro: RastroTransaccionPropia;
  restaurar: () => void;
} {
  const rastro: RastroTransaccionPropia = {
    vecesConnect: 0,
    vecesStartTransaction: 0,
    vecesSetConfig: 0,
    vecesCommit: 0,
    vecesRollback: 0,
    vecesRelease: 0,
  };
  const original = AppDataSource.createQueryRunner.bind(AppDataSource);
  espiaActivo = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementationOnce(() => {
    const queryRunner = original();
    const connectOriginal = queryRunner.connect.bind(queryRunner);
    const startOriginal = queryRunner.startTransaction.bind(queryRunner);
    const queryOriginal = queryRunner.query.bind(queryRunner);
    const commitOriginal = queryRunner.commitTransaction.bind(queryRunner);
    const rollbackOriginal = queryRunner.rollbackTransaction.bind(queryRunner);
    const releaseOriginal = queryRunner.release.bind(queryRunner);

    queryRunner.connect = (async () => {
      rastro.vecesConnect += 1;
      return connectOriginal();
    }) as QueryRunner['connect'];

    queryRunner.startTransaction = (async (nivel?: unknown) => {
      rastro.vecesStartTransaction += 1;
      return startOriginal(nivel as Parameters<QueryRunner['startTransaction']>[0]);
    }) as QueryRunner['startTransaction'];

    queryRunner.query = (async (sql: string, params?: unknown[]) => {
      if (sql === 'START TRANSACTION' && fallos.startTransactionSql) {
        throw fallos.startTransactionSql;
      }
      if (typeof sql === 'string' && sql.includes('app.empresa_id')) {
        rastro.vecesSetConfig += 1;
        if (fallos.setConfig) throw fallos.setConfig;
      }
      return queryOriginal(sql, params);
    }) as QueryRunner['query'];

    queryRunner.commitTransaction = (async () => {
      rastro.vecesCommit += 1;
      if (fallos.commit) throw fallos.commit;
      return commitOriginal();
    }) as QueryRunner['commitTransaction'];

    queryRunner.rollbackTransaction = (async () => {
      rastro.vecesRollback += 1;
      if (fallos.rollback) throw fallos.rollback;
      return rollbackOriginal();
    }) as QueryRunner['rollbackTransaction'];

    // El fallo de `release` se inyecta solo en la PRIMERA llamada real y después delega al
    // `release()` real — igual que `fallarProximoRelease` en `tenant-middleware-commit.test.ts`
    // (H09): si se hiciera fallar SIEMPRE, TypeORM nunca terminaría de liberar de verdad este
    // `QueryRunner` (queda registrado en `connectedQueryRunners`), y `AppDataSource.destroy()`
    // en el teardown de la suite lo reintenta y rompe el teardown por una razón ajena a lo que
    // este test verifica — cada operación real de este código solo llama a `release()` una
    // vez, así que esto no debilita ninguna aserción de "release intentado una vez".
    let primeraLlamadaRelease = true;
    queryRunner.release = (async () => {
      rastro.vecesRelease += 1;
      if (fallos.release && primeraLlamadaRelease) {
        primeraLlamadaRelease = false;
        throw fallos.release;
      }
      return releaseOriginal();
    }) as QueryRunner['release'];

    return queryRunner;
  });

  return { rastro, restaurar: () => espiaActivo?.mockRestore() };
}

describe('H13-A — ALS/RLS después del commit anticipado', () => {
  it('T-A07 — tenantRepository después del commit anticipado lanza (nunca cae a AppDataSource.manager)', async () => {
    let vioExcepcion = false;
    let mensaje = '';
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion();
      try {
        await categoriaRepository.find();
      } catch (error) {
        vioExcepcion = true;
        mensaje = error instanceof Error ? error.message : String(error);
      }
      res.status(200).json({ vioExcepcion, mensaje });
    });

    const respuesta = await request(appDePrueba).get('/api/harness-ctx');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.vioExcepcion).toBe(true);
    // El mensaje es el de nuestra guarda explícita (`tenant-repository.ts`), no un error de
    // driver ni datos de otra empresa — confirma que el camino fue "lanzar", no "usar
    // AppDataSource.manager en silencio y devolver filas de todas las empresas".
    expect(respuesta.body.mensaje).toMatch(/ya fue confirmada/i);
  });

  it('T-A08 — enTransaccion después del commit anticipado lanza explícitamente', async () => {
    let vioExcepcion = false;
    let mensaje = '';
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion();
      try {
        await enTransaccion(async (manager) => manager.query('SELECT 1'));
      } catch (error) {
        vioExcepcion = true;
        mensaje = error instanceof Error ? error.message : String(error);
      }
      res.status(200).json({ vioExcepcion, mensaje });
    });

    const respuesta = await request(appDePrueba).get('/api/harness-ctx');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.vioExcepcion).toBe(true);
    expect(respuesta.body.mensaje).toMatch(/ya fue confirmada/i);
  });

  it('T-A09 — conBypassRls después del commit anticipado lanza explícitamente', async () => {
    let vioExcepcion = false;
    let mensaje = '';
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion();
      try {
        await conBypassRls(async () => 'nunca debería llegar acá');
      } catch (error) {
        vioExcepcion = true;
        mensaje = error instanceof Error ? error.message : String(error);
      }
      res.status(200).json({ vioExcepcion, mensaje });
    });

    const respuesta = await request(appDePrueba).get('/api/harness-ctx');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.vioExcepcion).toBe(true);
    expect(respuesta.body.mensaje).toMatch(/ya fue confirmada/i);
  });

  it('T-A10 — ejecutarEnTransaccionPropia abre un QueryRunner nuevo con app.empresa_id correcto', async () => {
    const sesion = await crearEmpresaDePrueba();

    const empresaIdVistaPorPostgres = await ejecutarEnTransaccionPropia(
      sesion.empresaId,
      async () => {
        const contexto = contextoActual();
        expect(contexto?.empresaId).toBe(sesion.empresaId);
        expect(contexto?.manager).not.toBeNull();
        const fila: Array<{ empresa_id: string }> = await contexto!.queryRunner!.query(
          `SELECT current_setting('app.empresa_id', true) AS empresa_id`,
        );
        return fila[0]?.empresa_id;
      },
    );

    expect(empresaIdVistaPorPostgres).toBe(sesion.empresaId);
  });

  it('T-A11 — dentro de la transacción propia, tenantRepository usa el manager nuevo (no lanza, ve datos de ESA empresa)', async () => {
    const sesion = await crearEmpresaDePrueba();
    const nombre = `H13A-T-A11-${Date.now()}`;
    // Creada vía HTTP real (mismo camino que cualquier otro test de este repositorio): queda
    // con `empresa_id` correcto, sujeta a RLS.
    await api.post('/api/categorias', sesion, { nombre }).expect(201);

    const encontrada = await ejecutarEnTransaccionPropia(sesion.empresaId, async () => {
      return categoriaRepository.findOneBy({ nombre } as never);
    });

    // No lanzó (a diferencia de T-A07) y encontró la fila — confirma que dentro de
    // `ejecutarEnTransaccionPropia`, `tenantRepository` resuelve contra el manager nuevo, con
    // `app.empresa_id` correctamente fijado (RLS real, no un mock).
    expect(encontrada).not.toBeNull();
    expect(encontrada?.nombre).toBe(nombre);

    // Otra empresa no puede verla a través del mismo mecanismo — aislamiento intacto.
    const otraSesion = await crearEmpresaDePrueba();
    const noEncontrada = await ejecutarEnTransaccionPropia(otraSesion.empresaId, async () => {
      return categoriaRepository.findOneBy({ nombre } as never);
    });
    expect(noEncontrada).toBeNull();
  });

  it('T-A12 — al terminar la transacción propia se restaura el contexto HTTP cerrado; tenantRepository vuelve a lanzar', async () => {
    const sesion = await crearEmpresaDePrueba();
    let vioExcepcionDespues = false;
    let empresaIdDentro: string | null = null;
    const appDePrueba = appConfirmacionAnticipada(async (_req, res) => {
      await confirmarTransaccionDeLaPeticion();
      expect(contextoActual()?.manager).toBeNull();

      await ejecutarEnTransaccionPropia(sesion.empresaId, async () => {
        empresaIdDentro = contextoActual()?.empresaId ?? null;
        expect(contextoActual()?.manager).not.toBeNull();
      });

      // De vuelta en el contexto HTTP (cerrado) — ALS restaurado por Node, sin código extra.
      expect(contextoActual()?.manager).toBeNull();
      try {
        await categoriaRepository.find();
      } catch {
        vioExcepcionDespues = true;
      }
      res.status(200).json({ vioExcepcionDespues, empresaIdDentro });
    });

    const respuesta = await request(appDePrueba).get('/api/harness-ctx');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.vioExcepcionDespues).toBe(true);
    expect(respuesta.body.empresaIdDentro).toBe(sesion.empresaId);
  });

  it('T-A13 — un error dentro de la transacción propia se propaga al llamador (no queda fire-and-forget)', async () => {
    const sesion = await crearEmpresaDePrueba();
    const marcador = new Error('Fallo deliberado dentro de ejecutarEnTransaccionPropia (T-A13)');

    await expect(
      ejecutarEnTransaccionPropia(sesion.empresaId, async () => {
        throw marcador;
      }),
    ).rejects.toBe(marcador);
  });
});

/**
 * H13-A (Bloqueante 2 de la revisión de Codex) — lifecycle robusto del `QueryRunner` propio
 * de `ejecutarConConexionPropia` (compartido por `ejecutarEnTransaccionPropia` y
 * `ejecutarFueraDeLaPeticion`). Antes, `connect()`/`startTransaction()` vivían FUERA del
 * `try/catch` — si `startTransaction()` fallaba después de un `connect()` exitoso, la conexión
 * nunca se liberaba. Estos tests cubren cada punto de fallo del lifecycle por separado.
 */
describe('H13-A — lifecycle del QueryRunner en las transacciones propias', () => {
  const EMPRESA_DE_PRUEBA = '00000000-0000-0000-0000-000000000000';

  it('T-A19 — startTransaction() falla (connect ya tuvo éxito): release exactamente una vez, sin callback, sin commit, error original propagado', async () => {
    const errorOriginal = new Error('Fallo simulado de START TRANSACTION (T-A19)');
    const { rastro, restaurar } = espiarTransaccionPropia({ startTransactionSql: errorOriginal });
    let callbackLlamado = false;

    try {
      await expect(
        ejecutarEnTransaccionPropia(EMPRESA_DE_PRUEBA, async () => {
          callbackLlamado = true;
        }),
      ).rejects.toBe(errorOriginal);

      // `connect()` real se llama más de una vez por diseño de TypeORM (`query()` interno
      // empieza siempre con `await this.connect()`, incluida la query real de
      // `START TRANSACTION` que emite `startTransaction()`) — no es un `connect()` físico
      // nuevo cada vez (reutiliza la misma conexión ya abierta), así que no se afirma un
      // conteo exacto acá, solo que ocurrió al menos la llamada explícita esperada.
      expect(rastro.vecesConnect).toBeGreaterThanOrEqual(1);
      expect(rastro.vecesStartTransaction).toBe(1);
      expect(callbackLlamado).toBe(false);
      expect(rastro.vecesCommit).toBe(0);
      // `isTransactionActive` queda en `true` porque así lo fija el driver real ANTES de
      // emitir el `START TRANSACTION` que falla (ver `PostgresQueryRunner.startTransaction`)
      // — el intento de rollback que sigue es inofensivo (no hay transacción real que
      // Postgres deba revertir) y no reemplaza el error original.
      expect(rastro.vecesRollback).toBe(1);
      expect(rastro.vecesRelease).toBe(1);
    } finally {
      restaurar();
    }
  });

  it('T-A20 — set_config(app.empresa_id) falla: revierte, libera, sin callback, preserva el error original', async () => {
    const errorOriginal = new Error('Fallo simulado de set_config (T-A20)');
    const { rastro, restaurar } = espiarTransaccionPropia({ setConfig: errorOriginal });
    let callbackLlamado = false;

    try {
      await expect(
        ejecutarEnTransaccionPropia(EMPRESA_DE_PRUEBA, async () => {
          callbackLlamado = true;
        }),
      ).rejects.toBe(errorOriginal);

      expect(rastro.vecesStartTransaction).toBe(1);
      expect(rastro.vecesSetConfig).toBe(1);
      expect(callbackLlamado).toBe(false);
      expect(rastro.vecesCommit).toBe(0);
      // Acá la transacción SÍ empezó de verdad (el `START TRANSACTION` real tuvo éxito) —
      // el rollback es una reversión real, no un no-op.
      expect(rastro.vecesRollback).toBe(1);
      expect(rastro.vecesRelease).toBe(1);
    } finally {
      restaurar();
    }
  });

  it('T-A21 — el callback falla Y el rollback también falla: propaga el error ORIGINAL del callback', async () => {
    const errorCallback = new Error('Fallo simulado del callback (T-A21)');
    const errorRollback = new Error('Fallo simulado de rollback (T-A21)');
    const { rastro, restaurar } = espiarTransaccionPropia({ rollback: errorRollback });

    try {
      await expect(
        ejecutarEnTransaccionPropia(EMPRESA_DE_PRUEBA, async () => {
          throw errorCallback;
        }),
      ).rejects.toBe(errorCallback);

      expect(rastro.vecesRollback).toBe(1);
      expect(rastro.vecesRelease).toBe(1);
      expect(rastro.vecesCommit).toBe(0);
    } finally {
      restaurar();
    }
  });

  it('T-A22 — el callback falla Y el release también falla: propaga el error ORIGINAL del callback', async () => {
    const errorCallback = new Error('Fallo simulado del callback (T-A22)');
    const errorRelease = new Error('Fallo simulado de release (T-A22)');
    const { rastro, restaurar } = espiarTransaccionPropia({ release: errorRelease });

    try {
      await expect(
        ejecutarEnTransaccionPropia(EMPRESA_DE_PRUEBA, async () => {
          throw errorCallback;
        }),
      ).rejects.toBe(errorCallback);

      expect(rastro.vecesRollback).toBe(1);
      expect(rastro.vecesRelease).toBe(1);
      expect(rastro.vecesCommit).toBe(0);
    } finally {
      restaurar();
    }
  });

  it('T-A23 — el commit falla: propaga el error de commit, intenta rollback de recuperación, libera, nunca devuelve el resultado como durable', async () => {
    const errorCommit = new Error('Fallo simulado de commit (T-A23)');
    const { rastro, restaurar } = espiarTransaccionPropia({ commit: errorCommit });

    try {
      await expect(
        ejecutarEnTransaccionPropia(EMPRESA_DE_PRUEBA, async () => 'nunca-debe-devolverse'),
      ).rejects.toBe(errorCommit);

      expect(rastro.vecesCommit).toBe(1);
      // `isTransactionActive` sigue en `true` tras un commit fallido (TypeORM solo lo pone en
      // `false` en la rama de éxito) — el rollback de recuperación se intenta.
      expect(rastro.vecesRollback).toBe(1);
      expect(rastro.vecesRelease).toBe(1);
    } finally {
      restaurar();
    }
  });

  it('T-A24 — commit exitoso + release falla: devuelve el resultado igual (commit confirmado > fallo de release)', async () => {
    const errorRelease = new Error('Fallo simulado de release tras commit exitoso (T-A24)');
    const { rastro, restaurar } = espiarTransaccionPropia({ release: errorRelease });

    try {
      const resultado = await ejecutarEnTransaccionPropia(
        EMPRESA_DE_PRUEBA,
        async () => 'resultado-real',
      );

      expect(resultado).toBe('resultado-real');
      expect(rastro.vecesCommit).toBe(1);
      expect(rastro.vecesRollback).toBe(0);
      expect(rastro.vecesRelease).toBe(1);
    } finally {
      restaurar();
    }
  });

  it('T-A25 — ejecutarFueraDeLaPeticion: camino normal — empresa correcta, callback ejecutado, commit, release, resultado correcto', async () => {
    const sesion = await crearEmpresaDePrueba();

    const empresaVista = await ejecutarFueraDeLaPeticion(sesion.empresaId, async () => {
      return contextoActual()?.empresaId;
    });

    expect(empresaVista).toBe(sesion.empresaId);
  });

  it('T-A26 — ejecutarFueraDeLaPeticion: commit exitoso + release falla no convierte la operación en un rechazo (auditoría no se pierde por esto)', async () => {
    const errorRelease = new Error('Fallo simulado de release (T-A26)');
    const { restaurar } = espiarTransaccionPropia({ release: errorRelease });

    try {
      const resultado = await ejecutarFueraDeLaPeticion(EMPRESA_DE_PRUEBA, async () => 'auditoria-ok');
      expect(resultado).toBe('auditoria-ok');
    } finally {
      restaurar();
    }
  });
});
