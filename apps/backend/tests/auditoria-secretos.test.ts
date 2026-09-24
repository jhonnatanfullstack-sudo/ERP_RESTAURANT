import { afterAll, describe, expect, it } from 'vitest';
import type { QueryRunner } from 'typeorm';
import request from 'supertest';
import forge from 'node-forge';
import { AppDataSource } from '../src/database/data-source';
import { MigrationDataSource } from '../src/database/migration-data-source';
import { app } from '../src/app';
import { SanearOseClaveAuditoriaHistorica1789015000000 } from '../src/database/migrations/1789015000000-SanearOseClaveAuditoriaHistorica';
import {
  CAMPOS_SENSIBLES,
  REDACTADO,
  normalizarNombreCampo,
  redactar,
} from '../src/modules/auditoria/campos-sensibles';
import { api, crearEmpresaDePrueba, type Sesion } from './ayudantes';

/**
 * H02 — `oseClave` (credencial del proveedor OSE) quedaba en texto plano en
 * `registros_auditoria` porque `CAMPOS_SENSIBLES` no la incluía. Ver
 * `docs/auditoria/BACKLOG-TECNICO.md`.
 *
 * Archivo dedicado (no se amplía `auditoria.test.ts`, que cubre registro básico y aislamiento)
 * porque este hallazgo necesita doce casos: redacción en peticiones nuevas (T01-T08) y
 * saneamiento de filas históricas (T09-T12).
 */

function generarSecretoUnico(etiqueta: string): string {
  return `${etiqueta}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** El `sub` (id de usuario) viaja en el JWT pero `Sesion` (ayudantes.ts) solo expone
 * `empresaId` — se decodifica localmente, igual que hace `sesionDesde` internamente, sin tocar
 * ese archivo para no modificar un módulo compartido por toda la suite sin necesidad. */
function usuarioIdDeSesion(sesion: { token: string }): string {
  const payload = JSON.parse(Buffer.from(sesion.token.split('.')[1], 'base64').toString()) as {
    sub: string;
  };
  return payload.sub;
}

/** Abre su propia transacción con bypass de RLS, como el resto de la suite hace para leer o
 * escribir directamente `registros_auditoria`/`usuarios` (mismo patrón de
 * `h01-proveedor-semilla.test.ts`). */
async function conQueryRunnerDeAuditoria<T>(fn: (qr: QueryRunner) => Promise<T>): Promise<T> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const resultado = await fn(queryRunner);
    await queryRunner.commitTransaction();
    return resultado;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/** Inserta una fila "histórica" directamente en `registros_auditoria`, simulando una entrada
 * escrita ANTES de que `oseclave` se agregara a la denylist (sin pasar por el middleware, que
 * ya la redactaría). `datos` acepta cualquier valor serializable a JSON — incluidos objetos
 * anidados, arrays, primitivos JSON o `null` de JS, que el driver `pg` traduce a SQL NULL con
 * el cast `::jsonb` (distinto del `null` de JSON, que sí viaja como valor `jsonb`). */
async function insertarFilaHistorica(
  empresaId: string,
  usuarioId: string | null,
  datos: unknown,
): Promise<string> {
  return conQueryRunnerDeAuditoria(async (qr) => {
    const filas: Array<{ id: string }> = await qr.query(
      `INSERT INTO "registros_auditoria"
         ("empresa_id", "usuario_id", "accion", "modulo", "recurso_id", "metodo", "ruta",
          "estado_http", "ip", "datos")
       VALUES ($1, $2, 'actualizar', 'facturacion', NULL, 'PUT',
               '/api/facturacion/configuracion', 200, '127.0.0.1', $3::jsonb)
       RETURNING "id"`,
      [empresaId, usuarioId, datos === null ? null : JSON.stringify(datos)],
    );
    return filas[0].id;
  });
}

async function leerFila(id: string): Promise<{
  datos: unknown;
  usuarioId: string | null;
  empresaId: string;
  accion: string;
  modulo: string;
  metodo: string;
  ruta: string;
  estadoHttp: number;
  creadoEn: string;
}> {
  return conQueryRunnerDeAuditoria(async (qr) => {
    const filas: Array<{
      datos: unknown;
      usuario_id: string | null;
      empresa_id: string;
      accion: string;
      modulo: string;
      metodo: string;
      ruta: string;
      estado_http: number;
      creado_en: string;
    }> = await qr.query(`SELECT * FROM "registros_auditoria" WHERE "id" = $1`, [id]);
    const fila = filas[0];
    return {
      datos: fila.datos,
      usuarioId: fila.usuario_id,
      empresaId: fila.empresa_id,
      accion: fila.accion,
      modulo: fila.modulo,
      metodo: fila.metodo,
      ruta: fila.ruta,
      estadoHttp: fila.estado_http,
      creadoEn: fila.creado_en,
    };
  });
}

/**
 * La escritura de auditoría es intencionalmente "fire and forget": `auditoriaMiddleware`
 * dispara `void registrarAuditoria(...)` en `res.on('finish')` sin que la petición espere a
 * que termine (`tenant-context.ts::ejecutarFueraDeLaPeticion`, documentado como "nunca debe
 * tumbar una operación"). Por diseño, entonces, un `GET /api/auditoria` disparado inmediatamente
 * después de la petición auditada puede llegar antes de que esa escritura asíncrona haya
 * terminado — normalmente no se nota porque el gap es de microsegundos, pero bajo la carga de
 * toda la suite completa (muchas conexiones a la vez) se vuelve una carrera real. Se resuelve
 * reintentando la lectura con una espera acotada, no relajando ninguna aserción sobre el
 * contenido una vez que la entrada aparece. */
async function esperarEntradaAuditoria(
  sesion: Sesion,
  modulo: string,
  predicado: (registro: { ruta: string; metodo: string }) => boolean,
): Promise<Record<string, unknown> | undefined> {
  const INTENTOS = 30;
  const ESPERA_MS = 100;
  for (let intento = 0; intento < INTENTOS; intento += 1) {
    const bitacora = await api.get(`/api/auditoria?modulo=${modulo}`, sesion).expect(200);
    const entrada = bitacora.body.data.registros.find(predicado);
    if (entrada) return entrada;
    await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
  }
  return undefined;
}

/**
 * El `up()` real crea y elimina una función (`CREATE OR REPLACE FUNCTION` / `DROP FUNCTION`,
 * DDL sobre `public`), exactamente como lo hace `pnpm migration:run` en producción. `AppDataSource`
 * se conecta con el rol restringido de la aplicación (`DB_APP_USER`, sin privilegios de DDL —
 * ver `tests/setup.ts`), así que ejecutar el `up()` productivo de verdad necesita el mismo rol
 * dueño de las tablas que usan las migraciones reales (`MigrationDataSource`, ver
 * `migration-data-source.ts`), no el de la aplicación. Con ese rol, además, el bypass de RLS es
 * el mismo que ya aplica cualquier migración real (superusuario/dueño), sin necesitar el
 * `set_config('app.bypass_rls', ...)` manual que sí hace falta con el rol restringido.
 */
async function conQueryRunnerDeMigracion<T>(fn: (qr: QueryRunner) => Promise<T>): Promise<T> {
  if (!MigrationDataSource.isInitialized) {
    // Mismo motivo que `tests/setup.ts` para `AppDataSource`: `initialize()` carga las clases
    // de migración con `require()`, que no sabe interpretar TypeScript y revienta en la
    // primera migración `.ts`. No hacen falta acá — este helper solo abre una conexión con el
    // rol dueño para ejecutar el `up()`/`down()` de ESTA migración, ya importada directamente
    // más arriba — así que se vacía la lista antes de conectar, igual que hace `setup.ts`.
    MigrationDataSource.setOptions({ migrations: [] });
    await MigrationDataSource.initialize();
  }
  const queryRunner = MigrationDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const resultado = await fn(queryRunner);
    await queryRunner.commitTransaction();
    return resultado;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

afterAll(async () => {
  if (MigrationDataSource.isInitialized) {
    await MigrationDataSource.destroy();
  }
});

/** Ejecuta el `up()` real de la migración de saneamiento — no una reimplementación del SQL en
 * el test — contra Postgres, con el mismo rol y la misma clase que usaría
 * `pnpm migration:run`. */
async function ejecutarSaneamiento(): Promise<void> {
  return conQueryRunnerDeMigracion(async (qr) => {
    await new SanearOseClaveAuditoriaHistorica1789015000000().up(qr);
  });
}

async function ejecutarReversion(): Promise<void> {
  // `down()` no recibe (ni necesita) queryRunner: es un no-op documentado — ver la migración.
  return conQueryRunnerDeMigracion(async () => {
    await new SanearOseClaveAuditoriaHistorica1789015000000().down();
  });
}

describe('H02 — redacción de oseClave en auditoría (peticiones nuevas)', () => {
  it('T01 — PUT facturación válido con oseClave queda redactado y el secreto no aparece en el registro', async () => {
    const sesion = await crearEmpresaDePrueba();
    const secreto = generarSecretoUnico('T01');

    await api
      .put('/api/facturacion/configuracion', sesion, {
        oseProveedor: 'nubefact',
        oseUsuario: 'usuario-t01',
        oseClave: secreto,
        ambiente: 'beta',
        activo: true,
      })
      .expect(200);

    const entrada = await esperarEntradaAuditoria(sesion, 'facturacion', (r) => r.metodo === 'PUT');

    expect(entrada, 'debería existir una entrada de auditoría para el PUT').toBeDefined();
    expect((entrada as { datos: { oseClave: string } }).datos.oseClave).toBe(REDACTADO);
    expect(JSON.stringify(entrada)).not.toContain(secreto);
  });

  it('T02 — PUT facturación rechazado por validación tampoco expone el secreto', async () => {
    const sesion = await crearEmpresaDePrueba();
    const secreto = generarSecretoUnico('T02');

    const respuesta = await api.put('/api/facturacion/configuracion', sesion, {
      oseProveedor: 'proveedor-que-no-existe-en-el-enum',
      oseClave: secreto,
    });
    expect(respuesta.status).toBe(400);

    const entrada = (await esperarEntradaAuditoria(sesion, 'facturacion', (r) => r.metodo === 'PUT')) as
      | { estadoHttp: number; datos: { oseClave: string } }
      | undefined;

    expect(entrada, 'el intento rechazado también debe quedar auditado').toBeDefined();
    expect(entrada!.estadoHttp).toBe(400);
    expect(entrada!.datos.oseClave).toBe(REDACTADO);
    expect(JSON.stringify(entrada)).not.toContain(secreto);
  });

  it('T03 — objeto anidado con oseClave queda redactado', () => {
    const secreto = generarSecretoUnico('T03');
    const resultado = redactar({ configuracion: { oseClave: secreto, ambiente: 'beta' } }) as {
      configuracion: { oseClave: string; ambiente: string };
    };

    expect(resultado.configuracion.oseClave).toBe(REDACTADO);
    expect(resultado.configuracion.ambiente).toBe('beta');
    expect(JSON.stringify(resultado)).not.toContain(secreto);
  });

  it('T04 — array que contiene un objeto con oseClave queda redactado', () => {
    const secreto = generarSecretoUnico('T04');
    const resultado = redactar([
      { oseClave: secreto, oseUsuario: 'a' },
      { oseClave: 'otro-secreto-distinto', oseUsuario: 'b' },
    ]) as Array<{ oseClave: string; oseUsuario: string }>;

    expect(resultado[0].oseClave).toBe(REDACTADO);
    expect(resultado[1].oseClave).toBe(REDACTADO);
    expect(resultado[0].oseUsuario).toBe('a');
    expect(resultado[1].oseUsuario).toBe('b');
    expect(JSON.stringify(resultado)).not.toContain(secreto);
  });

  it('T05 — password/passwordActual/passwordNuevo siguen protegidos (sin regresión)', async () => {
    const sesion = await crearEmpresaDePrueba();
    const passwordActualFalsa = generarSecretoUnico('T05-actual');
    const passwordNuevaFalsa = generarSecretoUnico('T05-nuevo');

    const respuesta = await api.post('/api/auth/cambiar-password', sesion, {
      passwordActual: passwordActualFalsa,
      passwordNuevo: passwordNuevaFalsa,
    });
    expect(respuesta.status).not.toBe(200);

    const entrada = (await esperarEntradaAuditoria(
      sesion,
      'auth',
      (r) => r.ruta === '/api/auth/cambiar-password',
    )) as { datos: { passwordActual: string; passwordNuevo: string } } | undefined;

    expect(entrada).toBeDefined();
    expect(entrada!.datos.passwordActual).toBe(REDACTADO);
    expect(entrada!.datos.passwordNuevo).toBe(REDACTADO);
    expect(JSON.stringify(entrada)).not.toContain(passwordActualFalsa);
    expect(JSON.stringify(entrada)).not.toContain(passwordNuevaFalsa);
  });

  it('T06 — casing y separadores: oseClave, OSECLAVE, ose_clave, ose-clave', () => {
    const variantes = ['oseClave', 'OSECLAVE', 'ose_clave', 'ose-clave'];

    for (const variante of variantes) {
      expect(normalizarNombreCampo(variante)).toBe('oseclave');
      expect(CAMPOS_SENSIBLES.includes(normalizarNombreCampo(variante))).toBe(true);

      const secreto = generarSecretoUnico(variante);
      const resultado = redactar({ [variante]: secreto }) as Record<string, unknown>;
      expect(resultado[variante]).toBe(REDACTADO);
      expect(JSON.stringify(resultado)).not.toContain(secreto);
    }
  });

  it('T07 — campos legítimos que contienen una palabra sensible NO se redactan', () => {
    const entrada = {
      tokenExpiraEn: '2026-01-01T00:00:00.000Z',
      claveProducto: 'ABC-123',
      claveReferencia: 'REF-456',
    };
    const resultado = redactar(entrada) as typeof entrada;

    expect(resultado.tokenExpiraEn).toBe(entrada.tokenExpiraEn);
    expect(resultado.claveProducto).toBe(entrada.claveProducto);
    expect(resultado.claveReferencia).toBe(entrada.claveReferencia);
  });

  it('T08 — contraseña del certificado PFX/P12 protegida explícitamente (denylist + comportamiento real)', async () => {
    // (a) capa de denylist aislada: protege el campo `contrasena` sin importar el orden real
    // de middlewares — es la defensa que sobrevive si ese orden cambia en el futuro.
    const secretoCertificado = generarSecretoUnico('T08-pfx');
    const resultadoDirecto = redactar({ contrasena: secretoCertificado }) as {
      contrasena: string;
    };
    expect(resultadoDirecto.contrasena).toBe(REDACTADO);

    // (b) comportamiento HTTP real actual: el multipart de subida del certificado no deja el
    // valor en claro en la auditoría (hoy, por orden de middlewares; con (a) además protegido
    // aunque ese orden cambiara).
    const sesion = await crearEmpresaDePrueba();
    await api
      .put('/api/facturacion/configuracion', sesion, {
        oseProveedor: 'nubefact',
        oseUsuario: 'usuario-t08',
        oseClave: 'clave-t08-no-relevante',
        ambiente: 'beta',
        activo: true,
      })
      .expect(200);

    const par = forge.pki.rsa.generateKeyPair(1024);
    const certificado = forge.pki.createCertificate();
    certificado.publicKey = par.publicKey;
    certificado.serialNumber = '01';
    certificado.validity.notBefore = new Date();
    certificado.validity.notAfter = new Date();
    certificado.validity.notAfter.setFullYear(certificado.validity.notBefore.getFullYear() + 1);
    const atributos = [{ name: 'commonName', value: 'EMPRESA T08' }];
    certificado.setSubject(atributos);
    certificado.setIssuer(atributos);
    certificado.sign(par.privateKey, forge.md.sha256.create());
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, certificado, secretoCertificado, {
      algorithm: '3des',
    });
    const pfx = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

    await request(app)
      .post('/api/facturacion/configuracion/certificado')
      .set(sesion.h)
      .field('contrasena', secretoCertificado)
      .attach('certificado', pfx, 'certificado.pfx')
      .expect(200);

    const entradaCertificado = await esperarEntradaAuditoria(
      sesion,
      'facturacion',
      (r) => r.ruta === '/api/facturacion/configuracion/certificado',
    );

    expect(entradaCertificado, 'la subida del certificado también debe quedar auditada').toBeDefined();
    expect(JSON.stringify(entradaCertificado)).not.toContain(secretoCertificado);
  });
});

describe('H02 — saneamiento histórico de oseClave', () => {
  it('T09 — up() real sanea a cualquier profundidad (objetos, arrays, primitivos, NULL) y preserva el resto', async () => {
    const sesion = await crearEmpresaDePrueba();
    const empresaId = sesion.empresaId;
    const usuarioId = usuarioIdDeSesion(sesion);

    const s1 = generarSecretoUnico('S1');
    const s2 = generarSecretoUnico('S2');
    const s3 = generarSecretoUnico('S3');
    const s4 = generarSecretoUnico('S4');
    const s5 = generarSecretoUnico('S5');
    const s6 = generarSecretoUnico('S6');
    const secretos = [s1, s2, s3, s4, s5, s6];

    // H02-R01 (Codex): la migración debe alcanzar cualquier profundidad, no solo el nivel
    // superior — `auditoriaMiddleware` captura el body ANTES de `validateBody`, así que un
    // body rechazado por el DTO (que exige forma plana) igual pudo quedar auditado con
    // cualquier forma, incluida una anidada o un array en el nivel superior.
    const casos: Record<string, unknown> = {
      // 1. objeto plano
      plano: { oseClave: s1, ambiente: 'beta' },
      // 2. objeto anidado
      anidado: { configuracion: { oseClave: s2, oseUsuario: 'user' } },
      // 3. array en el nivel superior
      arraySuperior: [{ oseClave: s3 }],
      // 4. array dentro de un objeto
      arrayDentroDeObjeto: { items: [{ ose_clave: s4, cantidad: 2 }] },
      // 5. objetos/arrays más profundos, mezclando array→objeto→objeto y guion en la clave
      profundo: { a: [{ b: { 'ose-clave': s5 } }] },
      // 6. variante uppercase
      mayusculas: { OSECLAVE: s6 },
      // 7. objeto sin secreto — debe quedar exactamente igual
      sinSecretoObjeto: { oseUsuario: 'sin-secreto', ambiente: 'produccion', activo: true },
      // 8. array sin secreto — debe quedar exactamente igual
      sinSecretoArray: [{ oseUsuario: 'a' }, { oseUsuario: 'b' }],
      // 9. primitivo JSON en el nivel superior de `datos` (la columna lo permite: jsonb admite
      // cualquier valor JSON válido, no solo objetos)
      primitivo: 'solo-un-texto-sin-nada-sensible',
      // 10. SQL NULL (distinto del `null` de JSON)
      nulo: null,
    };

    const ids: Record<string, string> = {};
    for (const [nombre, valor] of Object.entries(casos)) {
      ids[nombre] = await insertarFilaHistorica(empresaId, usuarioId, valor);
    }

    await ejecutarSaneamiento();

    // Caso 1: plano.
    const filaPlano = await leerFila(ids.plano);
    expect((filaPlano.datos as { oseClave: string }).oseClave).toBe(REDACTADO);
    expect((filaPlano.datos as { ambiente: string }).ambiente).toBe('beta');

    // Caso 2: anidado.
    const filaAnidado = await leerFila(ids.anidado);
    const configuracion = (filaAnidado.datos as { configuracion: { oseClave: string; oseUsuario: string } })
      .configuracion;
    expect(configuracion.oseClave).toBe(REDACTADO);
    expect(configuracion.oseUsuario).toBe('user');

    // Caso 3: array superior.
    const filaArraySuperior = await leerFila(ids.arraySuperior);
    expect((filaArraySuperior.datos as Array<{ oseClave: string }>)[0].oseClave).toBe(REDACTADO);

    // Caso 4: array dentro de objeto, clave snake_case.
    const filaArrayDentroDeObjeto = await leerFila(ids.arrayDentroDeObjeto);
    const item = (filaArrayDentroDeObjeto.datos as { items: Array<{ ose_clave: string; cantidad: number }> })
      .items[0];
    expect(item.ose_clave).toBe(REDACTADO);
    expect(item.cantidad).toBe(2);

    // Caso 5: array→objeto→objeto, clave con guion.
    const filaProfundo = await leerFila(ids.profundo);
    const b = (filaProfundo.datos as { a: Array<{ b: Record<string, string> }> }).a[0].b;
    expect(b['ose-clave']).toBe(REDACTADO);

    // Caso 6: mayúsculas.
    const filaMayusculas = await leerFila(ids.mayusculas);
    expect((filaMayusculas.datos as { OSECLAVE: string }).OSECLAVE).toBe(REDACTADO);

    // Caso 7: objeto sin secreto — sin cambios.
    const filaSinSecretoObjeto = await leerFila(ids.sinSecretoObjeto);
    expect(filaSinSecretoObjeto.datos).toEqual(casos.sinSecretoObjeto);

    // Caso 8: array sin secreto — sin cambios.
    const filaSinSecretoArray = await leerFila(ids.sinSecretoArray);
    expect(filaSinSecretoArray.datos).toEqual(casos.sinSecretoArray);

    // Caso 9: primitivo JSON — sin cambios, no revienta la migración.
    const filaPrimitivo = await leerFila(ids.primitivo);
    expect(filaPrimitivo.datos).toBe(casos.primitivo);

    // Caso 10: SQL NULL — sigue NULL, no revienta la migración.
    const filaNulo = await leerFila(ids.nulo);
    expect(filaNulo.datos).toBeNull();

    // Ninguno de los 6 secretos originales sobrevive en NINGUNA fila, sin importar la
    // profundidad a la que estaba.
    for (const [nombre, id] of Object.entries(ids)) {
      const fila = await leerFila(id);
      for (const secreto of secretos) {
        expect(
          JSON.stringify(fila.datos),
          `el caso "${nombre}" no debería contener ningún secreto original`,
        ).not.toContain(secreto);
      }
      // Metadatos de auditoría preservados en todos los casos.
      expect(fila.usuarioId).toBe(usuarioId);
      expect(fila.empresaId).toBe(empresaId);
      expect(fila.accion).toBe('actualizar');
      expect(fila.modulo).toBe('facturacion');
      expect(fila.metodo).toBe('PUT');
      expect(fila.ruta).toBe('/api/facturacion/configuracion');
      expect(fila.estadoHttp).toBe(200);
      expect(fila.creadoEn).toBeDefined();
    }
  });

  it('T10 — el saneamiento real es idempotente para planos, anidados y arrays: el JSON completo es idéntico tras la 2ª corrida', async () => {
    const sesion = await crearEmpresaDePrueba();
    const sPlano = generarSecretoUnico('T10-plano');
    const sAnidado = generarSecretoUnico('T10-anidado');
    const sArray = generarSecretoUnico('T10-array');

    const idPlano = await insertarFilaHistorica(sesion.empresaId, null, {
      oseClave: sPlano,
      oseUsuario: 'usuario-t10',
      ambiente: 'produccion',
      activo: false,
    });
    const idAnidado = await insertarFilaHistorica(sesion.empresaId, null, {
      configuracion: { oseClave: sAnidado, ambiente: 'beta' },
      meta: { creado: 'manual' },
    });
    const idArray = await insertarFilaHistorica(sesion.empresaId, null, {
      items: [{ ose_clave: sArray, cantidad: 3 }, { cantidad: 5 }],
    });
    const ids = [idPlano, idAnidado, idArray];

    await ejecutarSaneamiento();
    const trasPrimeraCorrida = await Promise.all(ids.map(leerFila));

    // Segunda corrida: no debe fallar, no debe alterar nada más, y por supuesto no debe hacer
    // reaparecer ningún secreto original.
    await ejecutarSaneamiento();
    const trasSegundaCorrida = await Promise.all(ids.map(leerFila));

    for (let i = 0; i < ids.length; i += 1) {
      expect(trasSegundaCorrida[i].datos).toEqual(trasPrimeraCorrida[i].datos);
    }
    expect((trasSegundaCorrida[0].datos as { oseClave: string }).oseClave).toBe(REDACTADO);
    expect(
      (trasSegundaCorrida[1].datos as { configuracion: { oseClave: string } }).configuracion.oseClave,
    ).toBe(REDACTADO);
    expect(
      (trasSegundaCorrida[2].datos as { items: Array<{ ose_clave?: string }> }).items[0].ose_clave,
    ).toBe(REDACTADO);

    for (const secreto of [sPlano, sAnidado, sArray]) {
      expect(JSON.stringify(trasSegundaCorrida)).not.toContain(secreto);
    }
  });

  it('T11 — down() es irreversible por seguridad: nunca restaura el secreto original', async () => {
    const sesion = await crearEmpresaDePrueba();
    const secreto = generarSecretoUnico('T11');
    const id = await insertarFilaHistorica(sesion.empresaId, null, {
      oseClave: secreto,
      oseUsuario: 'usuario-t11',
      ambiente: 'beta',
      activo: true,
    });

    await ejecutarSaneamiento();
    const trasUp = await leerFila(id);
    expect((trasUp.datos as { oseClave: string }).oseClave).toBe(REDACTADO);

    await expect(ejecutarReversion()).resolves.toBeUndefined();

    const trasDown = await leerFila(id);
    expect((trasDown.datos as { oseClave: string }).oseClave).toBe(REDACTADO);
    expect(trasDown.datos).toEqual(trasUp.datos);
    expect(JSON.stringify(trasDown.datos)).not.toContain(secreto);
  });

  it('T12 — el aislamiento multiempresa (RLS) de la bitácora sigue intacto (sin falso positivo)', async () => {
    // H02-R02 (Codex): la versión anterior comprobaba "B no ve nada" sin antes demostrar que la
    // entrada de A existiera — un falso positivo si la escritura fire-and-forget de A todavía
    // no había terminado. La secuencia correcta es: A actúa, se CONFIRMA que la entrada de A ya
    // existe (con el mismo helper de espera que usan T01/T02/T05/T08), y solo entonces se
    // verifica que B no puede verla — identificándola por un dato no secreto (`oseUsuario`,
    // único por corrida) en vez de por "no hay ningún PUT", que sería igual de débil.
    const empresaA = await crearEmpresaDePrueba();
    const empresaB = await crearEmpresaDePrueba();
    const secreto = generarSecretoUnico('T12');
    const marcador = generarSecretoUnico('T12-marcador'); // no secreto: solo un correlator único

    await api
      .put('/api/facturacion/configuracion', empresaA, {
        oseProveedor: 'nubefact',
        oseUsuario: marcador,
        oseClave: secreto,
        ambiente: 'beta',
        activo: true,
      })
      .expect(200);

    // 1-3. Confirmar, DESDE A, que la entrada existe, está redactada y el secreto no aparece.
    const entradaDeA = (await esperarEntradaAuditoria(
      empresaA,
      'facturacion',
      (r) => r.metodo === 'PUT',
    )) as { datos: { oseClave: string; oseUsuario: string } } | undefined;

    expect(entradaDeA, 'la entrada de A debe existir antes de comprobar el aislamiento').toBeDefined();
    expect(entradaDeA!.datos.oseUsuario).toBe(marcador);
    expect(entradaDeA!.datos.oseClave).toBe(REDACTADO);
    expect(JSON.stringify(entradaDeA)).not.toContain(secreto);

    // 4-6. Solo ahora, consultar desde B (su propia sesión autenticada, SIN bypass de RLS —
    // exactamente el camino que seguiría un usuario real de esa empresa) y confirmar que no
    // puede ver la entrada de A, identificada por el marcador no secreto (no solo "no hay PUT",
    // que no distinguiría "no llegó a tiempo" de "RLS la bloquea").
    const bitacoraDeB = await api.get('/api/auditoria?modulo=facturacion', empresaB).expect(200);
    const entradaFiltradaEnB = bitacoraDeB.body.data.registros.find(
      (r: { datos?: { oseUsuario?: string } }) => r.datos?.oseUsuario === marcador,
    );

    expect(entradaFiltradaEnB, 'B no debe poder ver la entrada de A, ni siquiera por el marcador').toBeUndefined();
    expect(JSON.stringify(bitacoraDeB.body)).not.toContain(secreto);
    expect(JSON.stringify(bitacoraDeB.body)).not.toContain(marcador);
  });
});
