import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { AppDataSource } from '../src/database/data-source';
import { NeutralizarProveedorSemilla1789013000000 } from '../src/database/migrations/1789013000000-NeutralizarProveedorSemilla';
import { UnicoProveedorGlobal1789014000000 } from '../src/database/migrations/1789014000000-UnicoProveedorGlobal';
import {
  asignarProveedor,
  quitarProveedor,
} from '../src/modules/plataforma/proveedor-bootstrap.service';
import {
  IdInvalidoError,
  ProveedorNoEnConflictoError,
  SinConflictoPreH01Error,
  resolverProveedorPreH01,
  verificarProveedoresPreH01,
} from '../src/scripts/preflight-h01-core';
import { ADMIN_INICIAL, api, crearEmpresaDePrueba } from './ayudantes';
import type { Sesion } from './ayudantes';

/**
 * Pruebas de H01 — Cuenta semilla/proveedor (`docs/auditoria/BACKLOG-TECNICO.md`).
 *
 * Etapa 2 + correcciones de revisión Codex (R01-R07). Estado final:
 *
 * - **T01**: cuenta global de `es_proveedor = true` tras `migration:run` completo — debe ser 0.
 * - **T02**: verifica puntualmente, por consulta directa a la base (nunca por status HTTP, que
 *   puede depender de más de un control a la vez), que `admin@restaurant.local` quedó con
 *   `es_proveedor = false`.
 * - **T03**: un usuario asignado con `asignarProveedor` (el camino real, ya no SQL directo)
 *   accede al panel — demuestra que la asignación explícita y `requireProveedor` encajan.
 * - **T04-T06**: validaciones de `asignarProveedor` (email inexistente, segundo proveedor,
 *   rotación de contraseña pendiente), llamando exactamente a la misma función que usa el CLI.
 * - **R01**: `passwordNuevo` igual al actual se rechaza sin tocar el hash ni la bandera.
 * - **T07-T10**: ciclo completo de `debe_cambiar_password` (login sin bloqueo, cambiar
 *   contraseña, bloqueo centralizado de cualquier otra ruta, recuperación de acceso).
 * - **R04-A/B**: el invariante de "un solo proveedor" se sostiene aunque se intente saltar el
 *   servicio (`UPDATE` directo) o se lo llame dos veces a la vez (advisory lock + índice único).
 * - **R05a/R05b**: `cambiar-password` sigue funcionando con la suscripción vencida o suspendida
 *   — las demás rutas de negocio siguen bloqueadas igual que antes.
 * - **T11-T12**: ejercitan `NeutralizarProveedorSemilla.up()` directamente, sobre una base de
 *   datos temporal propia por prueba (nunca la compartida) — ver el bloque de infraestructura
 *   más abajo para el porqué.
 * - **R03**: mismo escenario que T11, pero con el email de la cuenta semilla ya cambiado — se
 *   sigue encontrando por procedencia estructural (`personal`), no por email.
 * - **R04-C**: con más de un proveedor preexistente, la migración del índice único falla sin
 *   elegir a cuál quitárselo.
 *
 * R02 (Socket.IO) y H01-R07 (sesiones ya emitidas antes de rotar, diferido a H06) no tienen
 * prueba en este archivo — R02 vive en `cocina-tiempo-real.test.ts`, que ya levanta un
 * servidor de sockets real.
 *
 * No se usan mocks de base de datos ni de autenticación: todo corre contra Postgres real,
 * igual que el resto de la suite.
 */

/**
 * Cuenta, en TODA la base (todas las empresas), cuántos usuarios tienen `es_proveedor = true`.
 *
 * Necesita el mismo bypass de RLS que ya usa `vencerDemo()` en `suscripcion.test.ts`: sin él,
 * la política de `usuarios` filtra por `app.empresa_id` y un conteo global devolvería 0 sin que
 * eso signifique nada (fallaría cerrado, no porque de verdad no haya ningún proveedor). El
 * bypass se fija con `set_config(..., true)`, local a la transacción de este `queryRunner` —
 * por eso hace falta abrir una transacción propia en vez de usar `AppDataSource.query` suelto.
 */
async function contarProveedoresGlobal(): Promise<number> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const [{ total }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM "usuarios" WHERE "es_proveedor" = true`,
    );
    await queryRunner.commitTransaction();
    return total;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/** El email no viaja en el JWT de la sesión de prueba, así que se resuelve consultando
 * `GET /api/auth/me` (ya existe, devuelve el usuario autenticado con su email). Solo para
 * armar el escenario de T03 sin tocar `ayudantes.ts`. */
async function emailDeSesion(sesion: Sesion): Promise<string> {
  const respuesta = await api.get('/api/auth/me', sesion).expect(200);
  return respuesta.body.data.email as string;
}

/**
 * Fija `debe_cambiar_password` directamente en la base, mismo patrón y misma razón que
 * `marcarProveedorDirecto`: todavía no existe ningún mecanismo de la aplicación para esto más
 * allá de la migración `NeutralizarProveedorSemilla` (que solo actúa sobre
 * `admin@restaurant.local`) — acá se prepara el escenario para T07-T10 sobre una cuenta de
 * prueba cualquiera, sin simular el futuro `proveedor-bootstrap.service`.
 */
async function marcarDebeCambiarPasswordDirecto(email: string, valor: boolean): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    await queryRunner.query(
      `UPDATE "usuarios" SET "debe_cambiar_password" = $1 WHERE "email" = $2`,
      [valor, email],
    );
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/**
 * Consulta directa (mismo patrón de bypass) de `es_proveedor` para un email puntual.
 *
 * T02 debe demostrar el estado de la columna en sí, no inferirlo de un status HTTP: una
 * petición puede quedar bloqueada por más de un control a la vez (ver T09, que sí prueba el
 * bloqueo por rotación de contraseña) — mezclar ambas cosas en una sola aserción no distingue
 * cuál de los dos controles es el que realmente se está verificando.
 */
async function esProveedorDirecto(email: string): Promise<boolean> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const filas: Array<{ es_proveedor: boolean }> = await queryRunner.query(
      `SELECT "es_proveedor" FROM "usuarios" WHERE "email" = $1`,
      [email],
    );
    // H01-R07 (revisión Codex): si la fila no existe, esto NO es "no es proveedor" — es una
    // pregunta sin sentido (no hay nadie a quien afirmárselo). Devolver `false` en ese caso
    // haría que una aserción `expect(...).toBe(false)` pasara igual aunque el email estuviera
    // mal escrito o el usuario nunca se hubiera creado, sin que la prueba se diera cuenta.
    // Se verifica ANTES del commit para que un fallo acá dispare un `rollback` real, no un
    // `rollback` sobre una transacción que ya se había confirmado.
    if (filas.length === 0) {
      throw new Error(
        `No existe ningún usuario con el email "${email}" — no se puede afirmar si es o no proveedor`,
      );
    }
    await queryRunner.commitTransaction();
    return filas[0].es_proveedor;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/** Contraseña fija que usa `crearEmpresaDePrueba()` (`ayudantes.ts`) para toda empresa de
 * prueba nueva — se reutiliza acá para poder volver a iniciar sesión con el mismo usuario. */
const PASSWORD_EMPRESA_DE_PRUEBA = 'ClaveDePrueba2026!';

/** Mismo patrón y misma razón que `vencerDemo()` en `suscripcion.test.ts` — se reimplementa
 * acá en vez de importarla porque es una función local de ese archivo, no exportada. */
async function venceLaDemoDirecto(empresaId: string): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    await queryRunner.query(
      `UPDATE "empresas" SET "demo_expira_en" = now() - interval '1 day' WHERE "id" = $1`,
      [empresaId],
    );
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/** Para R05b: simula una empresa suspendida por el proveedor (`plataforma.service.ts`), sin
 * pasar por ese flujo completo (que exigiría un proveedor real) — solo interesa el efecto en
 * `requireAuth`. */
async function suspenderEmpresaDirecto(empresaId: string): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    await queryRunner.query(`UPDATE "empresas" SET "suspendida" = true WHERE "id" = $1`, [
      empresaId,
    ]);
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

// =====================================================================================
// T11/T12 — infraestructura de prueba aislada para la migración `NeutralizarProveedorSemilla`.
//
// `global-setup.ts` migra la base COMPARTIDA una sola vez, con TODAS las migraciones ya
// aplicadas — no hay forma de observar ahí "el estado justo antes de la migración H01". Tocar
// esa infraestructura para conseguirlo fue explícitamente descartado.
//
// La opción de crear una base temporal y correrle el resto de las migraciones (`.runMigrations()`
// de TypeORM) se probó y se descartó por una razón técnica real, no de preferencia: TypeORM
// carga los archivos de migración con `require()`, y ese mecanismo no interpreta TypeScript —
// exactamente el mismo motivo por el que `global-setup.ts` y `tests/setup.ts` ya evitan ese
// camino (ver sus propios comentarios). `global-setup.ts` lo resuelve delegando en un
// subproceso real (`pnpm run migration:run`, que sí corre bajo `tsx`) — pero un subproceso no
// permite excluir selectivamente una sola migración de la corrida.
//
// En su lugar, cada prueba prepara a mano el ÚNICO estado del que depende
// `NeutralizarProveedorSemilla.up()`: tablas mínimas `usuarios`/`personal`/
// `tipos_documento_identidad` con una fila que reproduce exactamente lo que
// `SeedRbacInicial` + `UsuarioProveedor` dejan en una instalación real (incluida la
// procedencia estructural que usa H01-R03 para encontrar la cuenta aunque le hayan cambiado
// el email), sin necesidad de reproducir las otras ~77 migraciones para probar la lógica de
// esta. Nunca toca `restaurant_erp_test`.
// =====================================================================================

/** Cliente contra la base `postgres` con el rol dueño — el único que puede crear/borrar otra
 * base de datos (ese DDL no se puede ejecutar dentro de la base que se está creando/borrando,
 * mismo motivo por el que `global-setup.ts` usa una conexión separada para esto). */
async function clienteAdministrativo(): Promise<Client> {
  const cliente = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await cliente.connect();
  return cliente;
}

/** Sufijo aleatorio por ejecución: dos corridas de la suite en paralelo (o una que quedó a
 * medio terminar y no llegó a borrar su base) no chocan entre sí por compartir un nombre fijo. */
function nombreBaseTemporal(sufijo: string): string {
  return `restaurant_erp_test_h01_${sufijo}_${process.pid}_${randomUUID().slice(0, 8)}`;
}

/**
 * Cliente `pg` crudo contra la base TEMPORAL (no la `postgres` administrativa), con el rol
 * dueño — exactamente como se conectaría `preflight-h01.ts` en producción. Deliberadamente NO
 * se usa `dataSourceTemporal` (TypeORM) para ejercitar `preflight-h01-core.ts`: ese módulo
 * recibe un `pg.ClientBase` de verdad porque así es como lo usa el CLI real, nunca a través de
 * TypeORM (ver el comentario de cabecera de `preflight-h01-core.ts`).
 */
async function clienteTemporal(nombreBase: string): Promise<Client> {
  const cliente = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: nombreBase,
  });
  await cliente.connect();
  return cliente;
}

async function crearBaseTemporal(nombre: string): Promise<void> {
  const cliente = await clienteAdministrativo();
  try {
    await cliente.query(`DROP DATABASE IF EXISTS "${nombre}"`);
    await cliente.query(`CREATE DATABASE "${nombre}"`);
  } finally {
    await cliente.end();
  }
}

async function borrarBaseTemporal(nombre: string): Promise<void> {
  const cliente = await clienteAdministrativo();
  try {
    await cliente.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [nombre],
    );
    await cliente.query(`DROP DATABASE IF EXISTS "${nombre}"`);
  } finally {
    await cliente.end();
  }
}

/**
 * DataSource propio para la base temporal, con el rol DUEÑO — deliberadamente SIN la opción
 * `migrations`: no se necesita ninguna (ver el porqué arriba), y omitirla evita por completo
 * que TypeORM intente resolver/cargar archivos de migración. Ese mismo rol dueño es
 * superusuario en este entorno de desarrollo, así que la preparación del escenario tampoco
 * necesita el truco de `app.bypass_rls` — ya se salta RLS por privilegio de rol, igual que
 * cualquier migración real.
 */
async function construirDataSourceTemporal(nombreBase: string): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    host: env.db.host,
    port: env.db.port,
    database: nombreBase,
    username: env.db.user,
    password: env.db.password,
    ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
    synchronize: false,
  });
  await dataSource.initialize();
  return dataSource;
}

/**
 * Recrea el único estado del que depende `NeutralizarProveedorSemilla.up()` tras H01-R03: ya
 * no busca por email, sino por la procedencia estructural en `personal` (documento
 * `00000000`, nombre `Administrador Sistema`, tipo DNI) — así que la tabla mínima ahora
 * necesita también `personal` y `tipos_documento_identidad`, con esos valores exactos.
 *
 * `email` es parametrizable a propósito: T11/T12 usan el de siempre
 * (`admin@restaurant.local`), pero la prueba de R03 simula justo el caso que la motivó — la
 * cuenta semilla con el email YA CAMBIADO, para comprobar que igual se la encuentra por
 * procedencia, no por ese campo.
 */
async function prepararEscenario(
  dataSourceTemporal: DataSource,
  opciones: { email: string; passwordHash: string },
): Promise<void> {
  await dataSourceTemporal.query(`
    CREATE TABLE "tipos_documento_identidad" (
      "id" uuid PRIMARY KEY,
      "codigo" varchar(2) NOT NULL
    )
  `);
  await dataSourceTemporal.query(`
    CREATE TABLE "personal" (
      "id" uuid PRIMARY KEY,
      "tipo_documento_identidad_id" uuid NOT NULL REFERENCES "tipos_documento_identidad"("id"),
      "numero_documento" varchar(20) NOT NULL,
      "nombres" varchar(150),
      "apellido_paterno" varchar(100)
    )
  `);
  await dataSourceTemporal.query(`
    CREATE TABLE "usuarios" (
      "id" uuid PRIMARY KEY,
      "personal_id" uuid REFERENCES "personal"("id"),
      "email" varchar(150) UNIQUE NOT NULL,
      "password_hash" varchar(255) NOT NULL,
      "es_proveedor" boolean NOT NULL DEFAULT false,
      "creado_en" timestamptz NOT NULL DEFAULT now()
    )
  `);

  const tipoDniId = randomUUID();
  const personalId = randomUUID();
  await dataSourceTemporal.query(
    `INSERT INTO "tipos_documento_identidad" ("id", "codigo") VALUES ($1, '1')`,
    [tipoDniId],
  );
  await dataSourceTemporal.query(
    `INSERT INTO "personal" ("id", "tipo_documento_identidad_id", "numero_documento", "nombres", "apellido_paterno")
     VALUES ($1, $2, '00000000', 'Administrador', 'Sistema')`,
    [personalId, tipoDniId],
  );
  await dataSourceTemporal.query(
    `INSERT INTO "usuarios" ("id", "personal_id", "email", "password_hash", "es_proveedor")
     VALUES ($1, $2, $3, $4, true)`,
    [randomUUID(), personalId, opciones.email, opciones.passwordHash],
  );
}

/** Corre `up()` de la migración H01 a mano, envuelto en su propia transacción — la misma que
 * el ejecutor real de TypeORM le da a cada migración, y de la que depende
 * `activarBypassRls`/`set_config(..., true)` (es local a la transacción; sin una explícita,
 * cada `query()` correría en su propio auto-commit y el ajuste no llegaría a las consultas
 * siguientes). */
async function ejecutarMigracionH01(dataSourceTemporal: DataSource): Promise<void> {
  const queryRunner = dataSourceTemporal.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const migracion = new NeutralizarProveedorSemilla1789013000000();
    await migracion.up(queryRunner);
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function leerAdminSemilla(
  dataSourceTemporal: DataSource,
  email: string,
): Promise<{ es_proveedor: boolean; debe_cambiar_password: boolean | null }> {
  const [fila] = await dataSourceTemporal.query(
    `SELECT "es_proveedor", "debe_cambiar_password" FROM "usuarios" WHERE "email" = $1`,
    [email],
  );
  return fila;
}

/**
 * H01-R13 — reproduce el comportamiento REAL de `pnpm migration:run` (no una simplificación):
 * ambas migraciones de H01 corren en una única transacción, y solo se confirma si las dos
 * terminan sin error — exactamente lo que hace `MigrationExecutor` en modo `transaction: "all"`
 * (el efectivo en este proyecto, ver `preflight-h01-core.ts`). Si `UnicoProveedorGlobal` falla,
 * este helper revierte TODO, incluida `NeutralizarProveedorSemilla` — es la reproducción exacta
 * del bug conceptual que motivó H01-R13: antes de la corrección, la documentación asumía que la
 * primera migración quedaba confirmada aunque la segunda fallara, y eso nunca fue cierto con
 * `transaction: "all"`.
 */
async function ejecutarAmbasMigracionesH01ModoAll(dataSourceTemporal: DataSource): Promise<void> {
  const queryRunner = dataSourceTemporal.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await new NeutralizarProveedorSemilla1789013000000().up(queryRunner);
    await new UnicoProveedorGlobal1789014000000().up(queryRunner);
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function columnaDebeCambiarPasswordExiste(dataSourceTemporal: DataSource): Promise<boolean> {
  const filas: unknown[] = await dataSourceTemporal.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'debe_cambiar_password'`,
  );
  return filas.length > 0;
}

async function indiceProveedorGlobalExiste(dataSourceTemporal: DataSource): Promise<boolean> {
  const filas: unknown[] = await dataSourceTemporal.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_un_proveedor_global'`,
  );
  return filas.length > 0;
}

async function contarProveedoresEnBaseTemporal(dataSourceTemporal: DataSource): Promise<number> {
  const [{ total }] = await dataSourceTemporal.query(
    `SELECT COUNT(*)::int AS total FROM "usuarios" WHERE "es_proveedor" = true`,
  );
  return total;
}

describe('H01 — Cuenta semilla/proveedor', () => {
  // Los emails que esta prueba marca como proveedor (vía `asignarProveedor`, el mecanismo
  // real), para desmarcarlos al final y no dejar contaminado el conteo global que podría
  // interesarle a otra prueba futura.
  const emailsMarcadosEnEstaPrueba: string[] = [];

  afterAll(async () => {
    for (const email of emailsMarcadosEnEstaPrueba) {
      await quitarProveedor(email);
    }
  });

  it('T01 — una base nueva, tras todas las migraciones, no debería tener ningún proveedor', async () => {
    // Debe ejecutarse antes que T03 de este mismo archivo (que sí marca un proveedor a
    // propósito): vitest corre los `it` de un `describe` en orden de declaración, así que el
    // orden dentro de este archivo importa. No reordenar T01 después de T03.
    const total = await contarProveedoresGlobal();

    // Antes de la migración `NeutralizarProveedorSemilla`, esto fallaba: `UsuarioProveedor`/
    // `CorregirMarcaProveedor` siempre marcaban a `admin@restaurant.local` como proveedor en
    // una instalación nueva (es la única fila de `usuarios` en el momento en que esas
    // migraciones corren), sin que nadie lo hubiera decidido. La nueva migración revierte
    // exactamente eso porque la contraseña de esa cuenta sigue siendo el placeholder.
    expect(total).toBe(0);
  });

  it('T02 — admin@restaurant.local no debe quedar marcada como proveedor', async () => {
    // Verificación directa contra la base (no vía HTTP): tras `NeutralizarProveedorSemilla`,
    // `es_proveedor` debe ser `false` para esta cuenta. El bloqueo por rotación de contraseña
    // pendiente (`debe_cambiar_password`, que también aplica a esta misma cuenta) es un
    // control distinto y se verifica por separado en T09, sobre una cuenta preparada para eso
    // específicamente — así cada prueba aísla exactamente un control.
    const esProveedor = await esProveedorDirecto(ADMIN_INICIAL.email);
    expect(esProveedor).toBe(false);
  });

  it('T03 — un usuario marcado explícitamente como proveedor (vía asignarProveedor) sí puede entrar al panel', async () => {
    const empresa = await crearEmpresaDePrueba('ProveedorExplicito');

    // El usuario recién registrado todavía no es proveedor de nada — es un restaurante normal.
    const antes = await api.get('/api/plataforma/panel', empresa);
    expect(antes.status).toBe(404);

    // Ahora sí por el camino real de asignación explícita (H01 Etapa 2), no por SQL directo:
    // demuestra de punta a punta que `asignarProveedor` + la lectura de `requireProveedor`
    // encajan.
    const email = await emailDeSesion(empresa);
    await asignarProveedor(email);
    emailsMarcadosEnEstaPrueba.push(email);

    const despues = await api.get('/api/plataforma/panel', empresa);
    expect(despues.status).toBe(200);
    expect(despues.body.data).toBeDefined();

    // Limpieza inmediata, no diferida al `afterAll`: T05 necesita partir de "cero
    // proveedores" y corre después de esta prueba en el mismo archivo.
    await quitarProveedor(email);
  });

  it('T04 — asignar proveedor a un email inexistente falla y no modifica ningún usuario', async () => {
    const antes = await contarProveedoresGlobal();

    await expect(asignarProveedor('no-existe-en-absoluto@ejemplo.test')).rejects.toThrow();

    const despues = await contarProveedoresGlobal();
    expect(despues).toBe(antes);
  });

  it('T05 — si ya existe un proveedor, asignar otro distinto debe rechazarse siempre', async () => {
    const empresaA = await crearEmpresaDePrueba('ProveedorA');
    const emailA = await emailDeSesion(empresaA);
    await asignarProveedor(emailA);
    emailsMarcadosEnEstaPrueba.push(emailA);

    const empresaB = await crearEmpresaDePrueba('ProveedorB');
    const emailB = await emailDeSesion(empresaB);

    await expect(asignarProveedor(emailB)).rejects.toThrow();

    // A sigue siendo el proveedor, B nunca llegó a serlo — la operación fallida no dejó
    // ningún cambio a medias.
    expect(await esProveedorDirecto(emailA)).toBe(true);
    expect(await esProveedorDirecto(emailB)).toBe(false);

    await quitarProveedor(emailA);
  });

  it('T06 — un usuario con debe_cambiar_password=true no puede ser promovido a proveedor', async () => {
    const empresa = await crearEmpresaDePrueba('NoPuedeSerProveedorTodavia');
    const email = await emailDeSesion(empresa);
    await marcarDebeCambiarPasswordDirecto(email, true);

    await expect(asignarProveedor(email)).rejects.toThrow();

    expect(await esProveedorDirecto(email)).toBe(false);
  });

  it('R04-A — la base rechaza un segundo proveedor incluso saltándose el servicio (UPDATE directo)', async () => {
    const empresaA = await crearEmpresaDePrueba('R04A-ProveedorA');
    const emailA = await emailDeSesion(empresaA);
    await asignarProveedor(emailA);
    emailsMarcadosEnEstaPrueba.push(emailA);

    const empresaB = await crearEmpresaDePrueba('R04A-ProveedorB');
    const emailB = await emailDeSesion(empresaB);

    // Se salta `asignarProveedor` a propósito: un `UPDATE` directo (mismo patrón de bypass que
    // el resto de los helpers de este archivo) es exactamente el camino que el advisory lock
    // del servicio NO cubre — la garantía real tiene que venir de la base, no del código.
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
      await expect(
        queryRunner.query(`UPDATE "usuarios" SET "es_proveedor" = true WHERE "email" = $1`, [
          emailB,
        ]),
      ).rejects.toThrow();
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }

    expect(await esProveedorDirecto(emailA)).toBe(true);
    expect(await esProveedorDirecto(emailB)).toBe(false);

    await quitarProveedor(emailA);
  });

  it('R04-B — dos asignaciones concurrentes: exactamente una termina proveedor', async () => {
    const empresaA = await crearEmpresaDePrueba('R04B-Concurrente1');
    const emailA = await emailDeSesion(empresaA);
    const empresaB = await crearEmpresaDePrueba('R04B-Concurrente2');
    const emailB = await emailDeSesion(empresaB);

    const resultados = await Promise.allSettled([
      asignarProveedor(emailA),
      asignarProveedor(emailB),
    ]);

    const exitosas = resultados.filter((r) => r.status === 'fulfilled');
    expect(exitosas).toHaveLength(1);

    const [aEsProveedor, bEsProveedor] = await Promise.all([
      esProveedorDirecto(emailA),
      esProveedorDirecto(emailB),
    ]);
    // Exactamente una de las dos es proveedor — nunca ambas, nunca ninguna (una de las dos
    // peticiones SÍ tuvo que tener éxito, porque partían de cero proveedores).
    expect([aEsProveedor, bEsProveedor].filter(Boolean)).toHaveLength(1);

    await quitarProveedor(aEsProveedor ? emailA : emailB);
  });

  it('T07 — un usuario con debe_cambiar_password=true puede iniciar sesión con normalidad', async () => {
    const empresa = await crearEmpresaDePrueba('PendienteDeRotar');
    const email = await emailDeSesion(empresa);
    await marcarDebeCambiarPasswordDirecto(email, true);

    // El login en sí NO se bloquea (el bloqueo vive en `requireAuth`, que corre después del
    // login) — es la única forma de llegar al formulario de cambiar contraseña. Se hace la
    // petición cruda (no `iniciarSesion` de `ayudantes.ts`, que solo devuelve el token) para
    // poder inspeccionar también el `usuario` del body.
    const respuesta = await request(app)
      .post('/api/auth/login')
      .send({ email, password: PASSWORD_EMPRESA_DE_PRUEBA });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.data.usuario.debeCambiarPassword).toBe(true);
  });

  it('T08 — ese usuario puede ejecutar POST /api/auth/cambiar-password (y una contraseña actual incorrecta no limpia la bandera)', async () => {
    const empresa = await crearEmpresaDePrueba('CambiaSuPassword');
    const email = await emailDeSesion(empresa);
    await marcarDebeCambiarPasswordDirecto(email, true);

    // Contraseña actual incorrecta: debe rechazarse, y la bandera debe seguir en `true` — se
    // comprueba indirectamente pidiendo una ruta de negocio cualquiera, que debe seguir
    // bloqueada con 428 (si la bandera se hubiera limpiado por error, pasaría a 200/403).
    const incorrecta = await api.post('/api/auth/cambiar-password', empresa, {
      passwordActual: 'ContraseñaEquivocada123!',
      passwordNuevo: 'NuevaClaveSegura2026!',
    });
    expect(incorrecta.status).toBe(401);

    const todavíaBloqueado = await api.get('/api/categorias', empresa);
    expect(todavíaBloqueado.status).toBe(428);
    expect(todavíaBloqueado.body.codigo).toBe('DEBE_CAMBIAR_PASSWORD');

    // Contraseña actual correcta: debe aceptarse.
    const correcta = await api.post('/api/auth/cambiar-password', empresa, {
      passwordActual: PASSWORD_EMPRESA_DE_PRUEBA,
      passwordNuevo: 'NuevaClaveSegura2026!',
    });
    expect(correcta.status).toBe(200);
  });

  it('R01 — la contraseña nueva igual a la actual se rechaza sin modificar nada', async () => {
    const empresa = await crearEmpresaDePrueba('PasswordNuevaIgualALaActual');
    const email = await emailDeSesion(empresa);
    await marcarDebeCambiarPasswordDirecto(email, true);

    // Contraseña actual correcta, pero la "nueva" es idéntica — debe rechazarse.
    const rechazado = await api.post('/api/auth/cambiar-password', empresa, {
      passwordActual: PASSWORD_EMPRESA_DE_PRUEBA,
      passwordNuevo: PASSWORD_EMPRESA_DE_PRUEBA,
    });
    expect(rechazado.status).toBe(400);

    // Ni el hash ni la bandera de rotación se tocaron: la sesión sigue bloqueada, y la
    // contraseña original sigue siendo la única que funciona.
    const todaviaBloqueado = await api.get('/api/categorias', empresa);
    expect(todaviaBloqueado.status).toBe(428);

    const loginConLaMisma = await request(app)
      .post('/api/auth/login')
      .send({ email, password: PASSWORD_EMPRESA_DE_PRUEBA });
    expect(loginConLaMisma.status).toBe(200);
    expect(loginConLaMisma.body.data.usuario.debeCambiarPassword).toBe(true);
  });

  it('T09 — mientras debe_cambiar_password=true, cualquier otra ruta autenticada queda bloqueada con un error identificable', async () => {
    const empresa = await crearEmpresaDePrueba('BloqueadaEnTodoElSistema');
    const email = await emailDeSesion(empresa);
    await marcarDebeCambiarPasswordDirecto(email, true);

    // Muestra representativa de rutas de negocio, GET y POST, en módulos distintos: ninguna
    // debe distinguirse de las demás — el bloqueo vive en un solo lugar centralizado
    // (`requireAuth`), no en cada controller.
    const bloqueadas = await Promise.all([
      api.get('/api/productos', empresa),
      api.get('/api/ventas', empresa),
      api.post('/api/categorias', empresa, { nombre: 'NO DEBERÍA CREARSE' }),
    ]);
    for (const respuesta of bloqueadas) {
      expect(respuesta.status).toBe(428);
      expect(respuesta.body.codigo).toBe('DEBE_CAMBIAR_PASSWORD');
    }

    // Las del propio flujo de cambio de contraseña siguen alcanzables.
    const me = await api.get('/api/auth/me', empresa);
    expect(me.status).toBe(200);

    const logout = await api.post('/api/auth/logout', empresa);
    expect(logout.status).toBe(200);
  });

  it('T10 — tras cambiar la contraseña correctamente, debe_cambiar_password pasa a false y la sesión recupera acceso normal', async () => {
    const empresa = await crearEmpresaDePrueba('RecuperaAcceso');
    const email = await emailDeSesion(empresa);
    await marcarDebeCambiarPasswordDirecto(email, true);

    const bloqueadaAntes = await api.get('/api/categorias', empresa);
    expect(bloqueadaAntes.status).toBe(428);

    const cambio = await api.post('/api/auth/cambiar-password', empresa, {
      passwordActual: PASSWORD_EMPRESA_DE_PRUEBA,
      passwordNuevo: 'OtraClaveSegura2026!',
    });
    expect(cambio.status).toBe(200);

    // Mismo token, sin volver a iniciar sesión: `requireAuth` lee `debe_cambiar_password` de
    // la base en cada petición (igual criterio que `es_proveedor`), así que el cambio surte
    // efecto de inmediato en la sesión ya emitida.
    const permitidaAhora = await api.get('/api/categorias', empresa);
    expect(permitidaAhora.status).toBe(200);

    // Una sesión nueva (login con la contraseña ya rotada) también refleja el estado limpio.
    const nuevoLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'OtraClaveSegura2026!' });
    expect(nuevoLogin.status).toBe(200);
    expect(nuevoLogin.body.data.usuario.debeCambiarPassword).toBe(false);
  });

  it('R05a — debe_cambiar_password=true + suscripción vencida: cambiar-password sigue permitido', async () => {
    const empresa = await crearEmpresaDePrueba('VencidaYDebeCambiarPassword');
    const email = await emailDeSesion(empresa);
    await marcarDebeCambiarPasswordDirecto(email, true);
    await venceLaDemoDirecto(empresa.empresaId);

    // Cualquier otra ruta de negocio sigue bloqueada (por rotación pendiente, aunque acá
    // también lo estaría por la demo vencida).
    const bloqueada = await api.get('/api/categorias', empresa);
    expect(bloqueada.status).toBe(428);

    // Pero el propio flujo de rotación funciona igual.
    const cambio = await api.post('/api/auth/cambiar-password', empresa, {
      passwordActual: PASSWORD_EMPRESA_DE_PRUEBA,
      passwordNuevo: 'ClaveTrasVencer2026!',
    });
    expect(cambio.status).toBe(200);

    // Tras rotar, sigue viendo el 402 de siempre para operaciones de negocio — cambiar la
    // contraseña no reactiva la suscripción.
    const siguevencida = await api.post('/api/categorias', empresa, { nombre: 'X' });
    expect(siguevencida.status).toBe(402);
  });

  it('R05b — debe_cambiar_password=true + suscripción suspendida: cambiar-password sigue permitido', async () => {
    const empresa = await crearEmpresaDePrueba('SuspendidaYDebeCambiarPassword');
    const email = await emailDeSesion(empresa);
    await marcarDebeCambiarPasswordDirecto(email, true);
    await suspenderEmpresaDirecto(empresa.empresaId);

    // Con ambos controles activos a la vez, el de rotación de contraseña se dispara primero
    // (428) — corre antes que el de suscripción dentro de `requireAuth`. El 403 específico de
    // "suspendida" se verifica más abajo, ya con la contraseña rotada (un solo control activo).
    const bloqueadaLectura = await api.get('/api/categorias', empresa);
    expect(bloqueadaLectura.status).toBe(428);

    const cambio = await api.post('/api/auth/cambiar-password', empresa, {
      passwordActual: PASSWORD_EMPRESA_DE_PRUEBA,
      passwordNuevo: 'ClaveTrasSuspender2026!',
    });
    expect(cambio.status).toBe(200);

    // Tras rotar, sigue suspendida para todo lo demás.
    const sigueSuspendida = await api.get('/api/categorias', empresa);
    expect(sigueSuspendida.status).toBe(403);
  });

  it(
    'T11 — instalación existente con la contraseña semilla SIN rotar: la migración revoca es_proveedor y exige rotación',
    async () => {
      const nombreBase = nombreBaseTemporal('t11');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);

        // Estado previo: exactamente lo que deja `SeedRbacInicial` + `UsuarioProveedor` en una
        // instalación nueva — proveedor marcado por el fallback, contraseña todavía el
        // placeholder (nunca se rotó), email todavía el de arranque.
        const hashPlaceholder = await bcrypt.hash(ADMIN_INICIAL.password, 12);
        await prepararEscenario(dataSourceTemporal, {
          email: ADMIN_INICIAL.email,
          passwordHash: hashPlaceholder,
        });

        await ejecutarMigracionH01(dataSourceTemporal);

        const despues = await leerAdminSemilla(dataSourceTemporal, ADMIN_INICIAL.email);
        expect(despues.es_proveedor).toBe(false);
        expect(despues.debe_cambiar_password).toBe(true);
      } finally {
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );

  it(
    'T12 — instalación existente con la contraseña YA rotada: la migración no revoca es_proveedor automáticamente',
    async () => {
      const nombreBase = nombreBaseTemporal('t12');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);

        // Simula que el operador ya cambió la contraseña de esa cuenta antes de actualizar el
        // sistema — un hash distinto del placeholder, con el mismo formato bcrypt real.
        const hashRotado = await bcrypt.hash('YaLaRotéAntesDeActualizar2026!', 12);
        await prepararEscenario(dataSourceTemporal, {
          email: ADMIN_INICIAL.email,
          passwordHash: hashRotado,
        });

        await ejecutarMigracionH01(dataSourceTemporal);

        // Sin rastro del placeholder: la migración no tiene forma de distinguir esto de una
        // adopción deliberada, así que no toca nada — solo advierte (ver el propio comentario
        // de la migración).
        const despues = await leerAdminSemilla(dataSourceTemporal, ADMIN_INICIAL.email);
        expect(despues.es_proveedor).toBe(true);
        // Tampoco se le exige rotar: la migración solo fuerza esa columna cuando detecta el
        // placeholder sin cambiar, y acá ya no lo está.
        expect(despues.debe_cambiar_password).toBe(false);
      } finally {
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );

  it(
    'R03 — la cuenta semilla con el email YA CAMBIADO sigue detectándose por procedencia (personal), no por email',
    async () => {
      const nombreBase = nombreBaseTemporal('r03');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);

        // Mismo estado que T11 (proveedor + placeholder sin rotar), pero con un email
        // DISTINTO al de arranque — simula que alguien lo cambió (`PUT /api/usuarios/:id`)
        // sin rotar la contraseña. Antes de H01-R03, la migración buscaba exactamente
        // `email = 'admin@restaurant.local'` y no habría encontrado nada acá.
        const emailCambiado = 'ya-no-es-el-de-arranque@ejemplo.test';
        const hashPlaceholder = await bcrypt.hash(ADMIN_INICIAL.password, 12);
        await prepararEscenario(dataSourceTemporal, {
          email: emailCambiado,
          passwordHash: hashPlaceholder,
        });

        await ejecutarMigracionH01(dataSourceTemporal);

        const despues = await leerAdminSemilla(dataSourceTemporal, emailCambiado);
        expect(despues.es_proveedor).toBe(false);
        expect(despues.debe_cambiar_password).toBe(true);
      } finally {
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );

  it(
    'R04-C — con más de un proveedor preexistente, la migración del índice único falla sin elegir a cuál quitárselo',
    async () => {
      const nombreBase = nombreBaseTemporal('r04c');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);

        // Tabla mínima para ESTA migración: a diferencia de `NeutralizarProveedorSemilla`,
        // `UnicoProveedorGlobal` nunca toca `personal` — solo cuenta y lee `usuarios`.
        await dataSourceTemporal.query(`
          CREATE TABLE "usuarios" (
            "id" uuid PRIMARY KEY,
            "email" varchar(150) UNIQUE NOT NULL,
            "es_proveedor" boolean NOT NULL DEFAULT false
          )
        `);
        const emailA = 'r04c-proveedor-a@ejemplo.test';
        const emailB = 'r04c-proveedor-b@ejemplo.test';
        await dataSourceTemporal.query(
          `INSERT INTO "usuarios" ("id", "email", "es_proveedor") VALUES ($1, $2, true), ($3, $4, true)`,
          [randomUUID(), emailA, randomUUID(), emailB],
        );

        const queryRunner = dataSourceTemporal.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
          const migracion = new UnicoProveedorGlobal1789014000000();
          await expect(migracion.up(queryRunner)).rejects.toThrow();
        } finally {
          await queryRunner.rollbackTransaction();
          await queryRunner.release();
        }

        // Nada cambió: ambas siguen proveedor, y el índice nunca llegó a crearse.
        const filas: Array<{ email: string; es_proveedor: boolean }> =
          await dataSourceTemporal.query(`SELECT "email", "es_proveedor" FROM "usuarios" ORDER BY "email"`);
        expect(filas.every((f) => f.es_proveedor)).toBe(true);

        const indices: unknown[] = await dataSourceTemporal.query(
          `SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_un_proveedor_global'`,
        );
        expect(indices).toHaveLength(0);
      } finally {
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );

  // =====================================================================================
  // H01-R13 — recuperación PRE-H01 cuando ya hay más de un `es_proveedor = true` antes de
  // migrar. Usa la misma infraestructura de base temporal que T11/T12/R03/R04-C, más un
  // `pg.Client` crudo (`clienteTemporal`) para ejercitar `preflight-h01-core.ts` exactamente
  // como lo haría el CLI real — nunca a través de TypeORM.
  // =====================================================================================

  it(
    'R13-A — esquema PRE-H01 sin ningún proveedor: el preflight permite continuar',
    async () => {
      const nombreBase = nombreBaseTemporal('r13a');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      let cliente: Client | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);
        await dataSourceTemporal.query(`
          CREATE TABLE "usuarios" (
            "id" uuid PRIMARY KEY,
            "email" varchar(150) UNIQUE NOT NULL,
            "es_proveedor" boolean NOT NULL DEFAULT false
          )
        `);

        cliente = await clienteTemporal(nombreBase);
        const enConflicto = await verificarProveedoresPreH01(cliente);
        expect(enConflicto).toEqual([]);
      } finally {
        await cliente?.end();
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );

  it(
    'R13-B — esquema PRE-H01 con exactamente un proveedor: el preflight permite continuar sin modificarlo',
    async () => {
      const nombreBase = nombreBaseTemporal('r13b');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      let cliente: Client | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);
        await dataSourceTemporal.query(`
          CREATE TABLE "usuarios" (
            "id" uuid PRIMARY KEY,
            "email" varchar(150) UNIQUE NOT NULL,
            "es_proveedor" boolean NOT NULL DEFAULT false
          )
        `);
        const email = 'r13b-unico-proveedor@ejemplo.test';
        await dataSourceTemporal.query(
          `INSERT INTO "usuarios" ("id", "email", "es_proveedor") VALUES ($1, $2, true)`,
          [randomUUID(), email],
        );

        cliente = await clienteTemporal(nombreBase);
        const enConflicto = await verificarProveedoresPreH01(cliente);
        expect(enConflicto).toEqual([{ id: expect.any(String), email }]);

        // Solo lectura: nada cambió.
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(1);
      } finally {
        await cliente?.end();
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );

  it(
    'R13-C — esquema PRE-H01 con dos proveedores: el preflight detecta el conflicto y no elige automáticamente',
    async () => {
      const nombreBase = nombreBaseTemporal('r13c');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      let cliente: Client | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);
        await dataSourceTemporal.query(`
          CREATE TABLE "usuarios" (
            "id" uuid PRIMARY KEY,
            "email" varchar(150) UNIQUE NOT NULL,
            "es_proveedor" boolean NOT NULL DEFAULT false
          )
        `);
        const emailA = 'r13c-proveedor-a@ejemplo.test';
        const emailB = 'r13c-proveedor-b@ejemplo.test';
        const idA = randomUUID();
        const idB = randomUUID();
        await dataSourceTemporal.query(
          `INSERT INTO "usuarios" ("id", "email", "es_proveedor") VALUES ($1, $2, true), ($3, $4, true)`,
          [idA, emailA, idB, emailB],
        );

        cliente = await clienteTemporal(nombreBase);
        const enConflicto = await verificarProveedoresPreH01(cliente);
        expect(new Set(enConflicto.map((p) => p.id))).toEqual(new Set([idA, idB]));

        // La sola verificación nunca modifica nada: ambos siguen proveedor.
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(2);

        // Un id con formato inválido se rechaza SIN llegar a abrir ninguna transacción — nunca
        // se interpreta como "no encontrado en el conflicto" (son errores distintos a
        // propósito, ver `IdInvalidoError`/`ProveedorNoEnConflictoError`).
        await expect(
          resolverProveedorPreH01(cliente, { mantenerId: 'no-es-un-uuid' }),
        ).rejects.toBeInstanceOf(IdInvalidoError);
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(2);

        // Un id con formato válido pero que no es ninguno de los que están en conflicto ahora
        // mismo (no existe ningún usuario con ese id) se rechaza igual, sin tocar nada — nunca
        // se elige un sustituto.
        await expect(
          resolverProveedorPreH01(cliente, { mantenerId: randomUUID() }),
        ).rejects.toBeInstanceOf(ProveedorNoEnConflictoError);
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(2);
      } finally {
        await cliente?.end();
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );

  it(
    'R13-D — dos proveedores + selección explícita del operador por id: exactamente el elegido permanece proveedor',
    async () => {
      const nombreBase = nombreBaseTemporal('r13d');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      let cliente: Client | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);
        await dataSourceTemporal.query(`
          CREATE TABLE "usuarios" (
            "id" uuid PRIMARY KEY,
            "email" varchar(150) UNIQUE NOT NULL,
            "es_proveedor" boolean NOT NULL DEFAULT false
          )
        `);
        const emailA = 'r13d-proveedor-a@ejemplo.test';
        const emailB = 'r13d-proveedor-b@ejemplo.test';
        const idA = randomUUID();
        const idB = randomUUID();
        await dataSourceTemporal.query(
          `INSERT INTO "usuarios" ("id", "email", "es_proveedor") VALUES ($1, $2, true), ($3, $4, true)`,
          [idA, emailA, idB, emailB],
        );

        cliente = await clienteTemporal(nombreBase);

        // Se resuelve el conflicto real conservando explícitamente A, por id — nunca por email.
        const resultado = await resolverProveedorPreH01(cliente, { mantenerId: idA });
        expect(resultado.mantenido.id).toBe(idA);
        expect(resultado.mantenido.email).toBe(emailA);
        expect(resultado.revocados.map((r) => r.id)).toEqual([idB]);

        const filas: Array<{ id: string; es_proveedor: boolean }> = await dataSourceTemporal.query(
          `SELECT "id", "es_proveedor" FROM "usuarios" ORDER BY "email"`,
        );
        expect(filas.find((f) => f.id === idA)?.es_proveedor).toBe(true);
        expect(filas.find((f) => f.id === idB)?.es_proveedor).toBe(false);
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(1);

        // Resolver de nuevo, ya sin conflicto, se rechaza explícitamente en vez de no hacer
        // nada en silencio.
        await expect(
          resolverProveedorPreH01(cliente, { mantenerId: idA }),
        ).rejects.toBeInstanceOf(SinConflictoPreH01Error);
      } finally {
        await cliente?.end();
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );

  it(
    'R13-F — dos proveedores con emails que solo difieren por mayúsculas/minúsculas: la selección por id no es ambigua',
    async () => {
      const nombreBase = nombreBaseTemporal('r13f');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      let cliente: Client | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);
        await dataSourceTemporal.query(`
          CREATE TABLE "usuarios" (
            "id" uuid PRIMARY KEY,
            "email" varchar(150) UNIQUE NOT NULL,
            "es_proveedor" boolean NOT NULL DEFAULT false
          )
        `);

        // Distintos para PostgreSQL (la restricción única de "email" es sensible a
        // mayúsculas/minúsculas), pero equivalentes si alguien los normalizara con
        // `.toLowerCase()` — exactamente el caso que `email.toLowerCase() === candidato`
        // no podía distinguir (H01-R13, hallazgo Codex).
        const emailMayuscula = 'Proveedor@dominio.com';
        const emailMinuscula = 'proveedor@dominio.com';
        const idMayuscula = randomUUID();
        const idMinuscula = randomUUID();
        await dataSourceTemporal.query(
          `INSERT INTO "usuarios" ("id", "email", "es_proveedor") VALUES ($1, $2, true), ($3, $4, true)`,
          [idMayuscula, emailMayuscula, idMinuscula, emailMinuscula],
        );
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(2);

        cliente = await clienteTemporal(nombreBase);
        const enConflicto = await verificarProveedoresPreH01(cliente);

        // Ambas cuentas aparecen como filas DISTINTAS, con ids distintos — nunca se
        // deduplican ni se confunden por casing. No se asume ningún orden en particular
        // (el resultado no puede depender de `ORDER BY email`).
        expect(enConflicto).toHaveLength(2);
        const porId = new Map(enConflicto.map((p) => [p.id, p.email]));
        expect(porId.get(idMayuscula)).toBe(emailMayuscula);
        expect(porId.get(idMinuscula)).toBe(emailMinuscula);

        // El operador selecciona explícitamente el SEGUNDO (el de email en minúscula) por id.
        const resultado = await resolverProveedorPreH01(cliente, { mantenerId: idMinuscula });
        expect(resultado.mantenido.id).toBe(idMinuscula);
        expect(resultado.revocados.map((r) => r.id)).toEqual([idMayuscula]);

        const filas: Array<{ id: string; es_proveedor: boolean }> = await dataSourceTemporal.query(
          `SELECT "id", "es_proveedor" FROM "usuarios"`,
        );
        expect(filas.find((f) => f.id === idMinuscula)?.es_proveedor).toBe(true);
        expect(filas.find((f) => f.id === idMayuscula)?.es_proveedor).toBe(false);
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(1);
      } finally {
        await cliente?.end();
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );

  it(
    'R13-E — upgrade completo: falla en modo "all" antes del preflight, se resuelve, y luego ambas migraciones completan',
    async () => {
      const nombreBase = nombreBaseTemporal('r13e');
      await crearBaseTemporal(nombreBase);
      let dataSourceTemporal: DataSource | undefined;
      let cliente: Client | undefined;
      try {
        dataSourceTemporal = await construirDataSourceTemporal(nombreBase);

        // Estado PRE-H01 con tres proveedores: la cuenta semilla real (con placeholder sin
        // rotar, tal como T11) más otras dos cuentas ajenas a la semilla que también quedaron
        // marcadas `es_proveedor = true` (el escenario real que motiva H01-R13: una
        // instalación vieja donde nada impedía que eso pasara).
        await prepararEscenario(dataSourceTemporal, {
          email: ADMIN_INICIAL.email,
          passwordHash: await bcrypt.hash(ADMIN_INICIAL.password, 12),
        });
        const emailX = 'r13e-proveedor-x@ejemplo.test';
        const emailY = 'r13e-proveedor-y@ejemplo.test';
        const idX = randomUUID();
        const idY = randomUUID();
        await dataSourceTemporal.query(
          `INSERT INTO "usuarios" ("id", "email", "password_hash", "es_proveedor") VALUES
             ($1, $2, 'hash-irrelevante', true), ($3, $4, 'hash-irrelevante', true)`,
          [idX, emailX, idY, emailY],
        );
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(3);

        // PASO 1 — reproduce el bug conceptual de H01-R13: correr `migration:run` como antes
        // (sin preflight) sobre esta base falla, y el modo "all" real revierte TODO, incluida
        // la columna que agrega la primera migración.
        await expect(ejecutarAmbasMigracionesH01ModoAll(dataSourceTemporal)).rejects.toThrow();
        expect(await columnaDebeCambiarPasswordExiste(dataSourceTemporal)).toBe(false);
        expect(await indiceProveedorGlobalExiste(dataSourceTemporal)).toBe(false);
        // Nada quedó a medias: los tres siguen exactamente como antes del intento.
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(3);

        // PASO 2 — el preflight, SIN depender de `debe_cambiar_password` (no existe todavía),
        // detecta el conflicto por las columnas que sí existen desde antes de H01.
        cliente = await clienteTemporal(nombreBase);
        const enConflicto = await verificarProveedoresPreH01(cliente);
        expect(enConflicto.map((p) => p.email).sort()).toEqual(
          [ADMIN_INICIAL.email, emailX, emailY].sort(),
        );

        // PASO 3 — el operador decide explícitamente conservar X (una cuenta real, no la
        // semilla) y resuelve el conflicto con la herramienta PRE-H01, seleccionando por id —
        // nunca por email.
        const resultado = await resolverProveedorPreH01(cliente, { mantenerId: idX });
        expect(resultado.mantenido.id).toBe(idX);
        expect(resultado.mantenido.email).toBe(emailX);
        expect(resultado.revocados.map((r) => r.email).sort()).toEqual(
          [ADMIN_INICIAL.email, emailY].sort(),
        );
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(1);

        // PASO 4 — ahora sí, `migration:run` (modo "all" real) completa sin fallar: la cuenta
        // semilla se neutraliza igual que en T11 (sigue con el placeholder), y el índice único
        // queda protegiendo el invariante hacia adelante.
        await ejecutarAmbasMigracionesH01ModoAll(dataSourceTemporal);

        expect(await columnaDebeCambiarPasswordExiste(dataSourceTemporal)).toBe(true);
        expect(await indiceProveedorGlobalExiste(dataSourceTemporal)).toBe(true);
        expect(await contarProveedoresEnBaseTemporal(dataSourceTemporal)).toBe(1);

        const semillaFinal = await leerAdminSemilla(dataSourceTemporal, ADMIN_INICIAL.email);
        expect(semillaFinal.es_proveedor).toBe(false);
        expect(semillaFinal.debe_cambiar_password).toBe(true);

        const [{ es_proveedor: xSigueProveedor }] = await dataSourceTemporal.query(
          `SELECT "es_proveedor" FROM "usuarios" WHERE "email" = $1`,
          [emailX],
        );
        expect(xSigueProveedor).toBe(true);
      } finally {
        await cliente?.end();
        await dataSourceTemporal?.destroy();
        await borrarBaseTemporal(nombreBase);
      }
    },
    60_000,
  );
});
