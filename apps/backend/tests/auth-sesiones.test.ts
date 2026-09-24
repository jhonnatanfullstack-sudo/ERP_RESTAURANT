import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { QueryRunner } from 'typeorm';
import { app } from '../src/app';
import { AppDataSource } from '../src/database/data-source';
import { ejecutarEnContexto, establecerEmpresaDeLaPeticion } from '../src/database/tenant-context';
import type { ContextoTenant } from '../src/database/tenant-context';
import * as authService from '../src/modules/auth/auth.service';
import { REFRESH_COOKIE } from '../src/config/cookies';
import { api, crearEmpresaDePrueba } from './ayudantes';

/**
 * H06 (`docs/auditoria/BACKLOG-TECNICO.md`) — cambiar la contraseña no revocaba ningún
 * `refresh_token` previo del usuario: una sesión robada/olvidada seguía renovándose
 * indefinidamente después de que el usuario cambiara su contraseña por sospecha de robo.
 *
 * La corrección bloquea la fila del usuario (`SELECT ... FOR UPDATE`) tanto en
 * `cambiarPassword` como en `refrescarSesion`, con el mismo orden de locks, para que Postgres
 * serialice ambas operaciones del mismo usuario sin importar cuál llegue primero — y
 * `refrescarSesion` revalida el estado del refresh token DESPUÉS de obtener ese lock, nunca
 * antes. T11 ejercita esa serialización con transacciones controladas manualmente (mismo
 * mecanismo de bloqueo que producción), no con temporización arbitraria.
 *
 * Archivo dedicado: no existía ningún test de refresh/logout/rotación/cambio de contraseña en
 * toda la suite (`auth.test.ts` solo cubre login y autorización).
 */

function marcador(etiqueta: string): string {
  return `${etiqueta}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** Decodifica el `sub` (id de usuario) de un access token — no viaja en `Sesion`
 * (`ayudantes.ts`), que solo expone `empresaId`. */
function usuarioIdDeAccessToken(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString()) as {
    sub: string;
  };
  return payload.sub;
}

interface SesionConCookie {
  accessToken: string;
  /** `"refresh_token=<valor>"`, lista para `.set('Cookie', ...)`. */
  cookie: string;
  /** El valor crudo del JWT de refresh, para invocar `authService.refrescarSesion` directo. */
  valorRefresh: string;
}

/** Login real vía HTTP que además captura la cookie de refresh — `ayudantes.ts::iniciarSesion`
 * descarta el `Set-Cookie`, y estos tests la necesitan explícitamente. */
async function loginConCookie(email: string, password: string): Promise<SesionConCookie> {
  const respuesta = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  const cookies = respuesta.headers['set-cookie'] as unknown as string[] | undefined;
  const cruda = cookies?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!cruda) throw new Error('El login no devolvió la cookie de refresh');
  const cookie = cruda.split(';')[0];
  const valorRefresh = decodeURIComponent(cookie.split('=')[1]);
  return { accessToken: respuesta.body.data.accessToken as string, cookie, valorRefresh };
}

/** Abre una transacción propia, con el mismo tipo de contexto que `tenant.middleware.ts` monta
 * por petición — para invocar `authService.*` directamente y controlar a mano cuándo confirma
 * (commit), en vez de dejar que lo haga el middleware al final de una petición HTTP real. Así
 * T11 puede mantener el lock de Postgres abierto deliberadamente mientras otra petición HTTP
 * real intenta tomarlo, sin depender de ninguna espera arbitraria. */
async function abrirTransaccionControlada(): Promise<{
  contexto: ContextoTenant;
  queryRunner: QueryRunner;
  commit: () => Promise<void>;
}> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  const contexto: ContextoTenant = {
    empresaId: null,
    manager: queryRunner.manager,
    queryRunner,
    pendientesTrasConfirmar: [],
  };
  return {
    contexto,
    queryRunner,
    commit: async () => {
      await queryRunner.commitTransaction();
      await queryRunner.release();
    },
  };
}

/**
 * Espera, sondeando `pg_stat_activity` (no un `sleep` a ciegas), a que exista una conexión
 * realmente detenida esperando un lock sobre `usuarios` — es decir, a que la petición HTTP
 * concurrente haya llegado de verdad al `FOR UPDATE` y esté bloqueada ahí. Solo entonces es
 * seguro liberar el lock que la está deteniendo: liberarlo antes no demostraría contención real.
 *
 * Un `SELECT ... FOR UPDATE` bloqueado por la fila de OTRA transacción no aparece en `pg_locks`
 * como un lock de `relation` con `granted = false` (ese se concede de inmediato — leer la tabla
 * es compatible) sino como una espera de tipo `Lock` en `pg_stat_activity` mientras Postgres
 * resuelve el lock de tupla internamente; por eso se sondea ahí y no en `pg_locks` directamente.
 */
async function esperarBloqueoEnUsuarios(): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    const INTENTOS = 150;
    const ESPERA_MS = 20;
    for (let intento = 0; intento < INTENTOS; intento += 1) {
      const filas: Array<{ existe: boolean }> = await queryRunner.query(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND query ILIKE '%"usuarios"%'
        ) AS existe
      `);
      if (filas[0]?.existe) return;
      await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
    }
    throw new Error(
      'La petición concurrente nunca llegó a esperar el lock de "usuarios" — no se pudo demostrar contención real',
    );
  } finally {
    await queryRunner.release();
  }
}

describe('H06 — sesiones (login, refresh, logout, cambio de contraseña)', () => {
  it('T01 — login emite refresh y el refresh renueva el access token', async () => {
    const empresa = await crearEmpresaDePrueba();
    const sesion = await loginConCookie(empresa.email, empresa.password);

    const respuesta = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesion.cookie)
      .expect(200);

    // No se compara contra el access token anterior: dos tokens firmados con las mismas claims
    // dentro del mismo segundo (`iat` de un JWT es por segundo, no por milisegundo) producen el
    // mismo string — coincidencia posible en un test rápido, no un defecto de seguridad. Lo que
    // importa es que el refresh haya funcionado y siga devolviendo un access token con forma
    // válida.
    expect(typeof respuesta.body.data.accessToken).toBe('string');
    expect(respuesta.body.data.accessToken.split('.')).toHaveLength(3);
  });

  it('T02 — rotación: un refresh ya usado no puede reutilizarse', async () => {
    const empresa = await crearEmpresaDePrueba();
    const sesion = await loginConCookie(empresa.email, empresa.password);

    await request(app).post('/api/auth/refresh').set('Cookie', sesion.cookie).expect(200);
    // Reintentar con la cookie ORIGINAL (ya rotada) debe fallar.
    await request(app).post('/api/auth/refresh').set('Cookie', sesion.cookie).expect(401);
  });

  it('T03 — logout revoca la sesión actual', async () => {
    const empresa = await crearEmpresaDePrueba();
    const sesion = await loginConCookie(empresa.email, empresa.password);

    await request(app).post('/api/auth/logout').set('Cookie', sesion.cookie).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', sesion.cookie).expect(401);
  });

  it('T04 — CRÍTICO: cambiar la contraseña revoca un refresh token emitido antes del cambio', async () => {
    const empresa = await crearEmpresaDePrueba();
    const sesionVieja = await loginConCookie(empresa.email, empresa.password);
    const passwordNueva = marcador('Clave') + 'Aa1!';

    await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${sesionVieja.accessToken}`)
      .send({ passwordActual: empresa.password, passwordNuevo: passwordNueva })
      .expect(200);

    // Este es exactamente el caso que fallaba antes del fix (H06): la sesión vieja seguía
    // pudiendo renovarse después del cambio de contraseña.
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesionVieja.cookie)
      .expect(401);
  });

  it('T05 — cambiar la contraseña revoca TODAS las sesiones del usuario, no solo una', async () => {
    const empresa = await crearEmpresaDePrueba();
    // Dos sesiones independientes del MISMO usuario, como dos dispositivos distintos.
    const sesionDispositivoA = await loginConCookie(empresa.email, empresa.password);
    const sesionDispositivoB = await loginConCookie(empresa.email, empresa.password);
    const passwordNueva = marcador('Clave') + 'Aa1!';

    await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${sesionDispositivoA.accessToken}`)
      .send({ passwordActual: empresa.password, passwordNuevo: passwordNueva })
      .expect(200);

    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesionDispositivoA.cookie)
      .expect(401);
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesionDispositivoB.cookie)
      .expect(401);
  });

  it('T06 — tras el cambio, la contraseña vieja se rechaza y la nueva funciona con un refresh nuevo', async () => {
    const empresa = await crearEmpresaDePrueba();
    const sesionVieja = await loginConCookie(empresa.email, empresa.password);
    const passwordNueva = marcador('Clave') + 'Aa1!';

    await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${sesionVieja.accessToken}`)
      .send({ passwordActual: empresa.password, passwordNuevo: passwordNueva })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: empresa.email, password: empresa.password })
      .expect(401);

    const sesionNueva = await loginConCookie(empresa.email, passwordNueva);
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesionNueva.cookie)
      .expect(200);
  });

  it('T07 — usuario desactivado: el refresh previo queda rechazado', async () => {
    const empresa = await crearEmpresaDePrueba();
    const sesion = await loginConCookie(empresa.email, empresa.password);
    const usuarioId = usuarioIdDeAccessToken(sesion.accessToken);

    // `actualizarUsuario` (a diferencia de `eliminarUsuario`) no bloquea la autodesactivación —
    // confirmado en `usuario.service.ts`. Se usa acá solo para fijar `activo=false` por el
    // camino real de la aplicación, sin tocar la base directamente.
    await api.put(`/api/usuarios/${usuarioId}`, empresa, { activo: false }).expect(200);

    await request(app).post('/api/auth/refresh').set('Cookie', sesion.cookie).expect(401);
  });

  it('T08 — tokens inválidos: refresh manipulado y access usado como refresh, ambos rechazados', async () => {
    const empresa = await crearEmpresaDePrueba();
    const sesion = await loginConCookie(empresa.email, empresa.password);

    const cookieManipulada = `${REFRESH_COOKIE}=${sesion.valorRefresh.slice(0, -4)}aaaa`;
    await request(app).post('/api/auth/refresh').set('Cookie', cookieManipulada).expect(401);

    // El access token está firmado con un secreto distinto al del refresh — `jwt.verify` contra
    // el secreto de refresh debe fallar por firma inválida.
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${sesion.accessToken}`)
      .expect(401);
  });

  it('T09 — aislamiento: cambiar la contraseña de un usuario no afecta el refresh de otro (otra empresa)', async () => {
    const empresaA = await crearEmpresaDePrueba();
    const empresaB = await crearEmpresaDePrueba();
    const sesionA = await loginConCookie(empresaA.email, empresaA.password);
    const sesionB = await loginConCookie(empresaB.email, empresaB.password);

    await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${sesionA.accessToken}`)
      .send({ passwordActual: empresaA.password, passwordNuevo: marcador('Clave') + 'Aa1!' })
      .expect(200);

    // El refresh de B (otra empresa, otro usuario) sigue funcionando con total normalidad.
    await request(app).post('/api/auth/refresh').set('Cookie', sesionB.cookie).expect(200);
  });

  it('T10 — H01: debeCambiarPassword pasa a false y el refresh anterior también queda revocado', async () => {
    const empresa = await crearEmpresaDePrueba();
    const sesionInicial = await loginConCookie(empresa.email, empresa.password);
    const usuarioId = usuarioIdDeAccessToken(sesionInicial.accessToken);

    // Simula el estado que deja H01 en una cuenta con la contraseña placeholder — se fija
    // directamente para no depender de la migración semilla, igual patrón que
    // `h01-proveedor-semilla.test.ts::marcarDebeCambiarPasswordDirecto`.
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
      await queryRunner.query(`UPDATE "usuarios" SET "debe_cambiar_password" = true WHERE "id" = $1`, [
        usuarioId,
      ]);
      await queryRunner.commitTransaction();
    } finally {
      await queryRunner.release();
    }

    const passwordNueva = marcador('Clave') + 'Aa1!';
    await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${sesionInicial.accessToken}`)
      .send({ passwordActual: empresa.password, passwordNuevo: passwordNueva })
      .expect(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${sesionInicial.accessToken}`)
      .expect(200);
    expect(me.body.data.debeCambiarPassword).toBe(false);

    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesionInicial.cookie)
      .expect(401);
  });

  it('T11 — concurrencia: ninguna sesión sobrevive a un cambio de contraseña, en cualquiera de los dos órdenes', async () => {
    // --- Orden A: el refresh gana el lock primero; el cambio de contraseña lo alcanza después ---
    const empresaOrdenA = await crearEmpresaDePrueba();
    const sesionOrdenA = await loginConCookie(empresaOrdenA.email, empresaOrdenA.password);

    const refrescoConcurrente = await abrirTransaccionControlada();
    const sesionNacidaEnLaCarrera = await ejecutarEnContexto(refrescoConcurrente.contexto, () =>
      authService.refrescarSesion(sesionOrdenA.valorRefresh),
    );
    // La rotación ya ocurrió DENTRO de la transacción, pero todavía no se confirmó: el lock
    // sobre la fila del usuario sigue tomado por `refrescoConcurrente`.

    const intentoCambioPromise = request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${sesionOrdenA.accessToken}`)
      .send({ passwordActual: empresaOrdenA.password, passwordNuevo: marcador('Clave') + 'Aa1!' })
      .then((respuesta) => respuesta);

    await esperarBloqueoEnUsuarios();
    await refrescoConcurrente.commit();
    const respuestaCambio = await intentoCambioPromise;
    expect(respuestaCambio.status).toBe(200);

    // Ni la sesión original (ya rotada por su propio uso) ni la nacida DURANTE la carrera
    // sobreviven al cambio de contraseña que se resolvió después.
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesionOrdenA.cookie)
      .expect(401);
    await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE}=${sesionNacidaEnLaCarrera.refreshToken}`)
      .expect(401);

    // --- Orden B: el cambio de contraseña gana el lock primero; el refresh queda bloqueado detrás ---
    const empresaOrdenB = await crearEmpresaDePrueba();
    const sesionOrdenB = await loginConCookie(empresaOrdenB.email, empresaOrdenB.password);
    const usuarioIdOrdenB = usuarioIdDeAccessToken(sesionOrdenB.accessToken);

    const cambioConcurrente = await abrirTransaccionControlada();
    await ejecutarEnContexto(cambioConcurrente.contexto, async () => {
      await establecerEmpresaDeLaPeticion(empresaOrdenB.empresaId);
      await authService.cambiarPassword(usuarioIdOrdenB, {
        passwordActual: empresaOrdenB.password,
        passwordNuevo: marcador('Clave') + 'Aa1!',
      });
    });
    // El cambio de contraseña y la revocación total ya ocurrieron dentro de la transacción,
    // pero tampoco se confirmaron todavía: el lock sigue tomado por `cambioConcurrente`.

    const intentoRefrescoPromise = request(app)
      .post('/api/auth/refresh')
      .set('Cookie', sesionOrdenB.cookie)
      .then((respuesta) => respuesta);

    await esperarBloqueoEnUsuarios();
    await cambioConcurrente.commit();
    const respuestaRefresco = await intentoRefrescoPromise;

    // El refresh que estaba bloqueado detrás del cambio de contraseña debe salir rechazado —
    // nunca debe lograr crear una sesión nueva una vez que el cambio ya se confirmó.
    expect(respuestaRefresco.status).toBe(401);
  });

  it('T12 — H02: la auditoría de un cambio de contraseña EXITOSO sigue redactando passwordActual/passwordNuevo', async () => {
    const empresa = await crearEmpresaDePrueba();
    const sesion = await loginConCookie(empresa.email, empresa.password);
    const passwordNueva = marcador('Clave') + 'Aa1!';

    await request(app)
      .post('/api/auth/cambiar-password')
      .set('Authorization', `Bearer ${sesion.accessToken}`)
      .send({ passwordActual: empresa.password, passwordNuevo: passwordNueva })
      .expect(200);

    // La escritura de auditoría es fire-and-forget (H21) — se reintenta con espera acotada,
    // mismo patrón que `auditoria-secretos.test.ts::esperarEntradaAuditoria`.
    let entrada: { datos: { passwordActual: string; passwordNuevo: string } } | undefined;
    for (let intento = 0; intento < 30 && !entrada; intento += 1) {
      const bitacora = await request(app)
        .get('/api/auditoria?modulo=auth')
        .set('Authorization', `Bearer ${sesion.accessToken}`)
        .expect(200);
      entrada = bitacora.body.data.registros.find(
        (r: { ruta: string }) => r.ruta === '/api/auth/cambiar-password',
      );
      if (!entrada) await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(entrada, 'debería existir una entrada de auditoría para el cambio exitoso').toBeDefined();
    expect(entrada!.datos.passwordActual).toBe('[redactado]');
    expect(entrada!.datos.passwordNuevo).toBe('[redactado]');
    expect(JSON.stringify(entrada)).not.toContain(empresa.password);
    expect(JSON.stringify(entrada)).not.toContain(passwordNueva);
  });
});
