import { describe, expect, it, vi, afterEach } from 'vitest';
import request from 'supertest';
import forge from 'node-forge';
import { app } from '../src/app';
import { AppDataSource } from '../src/database/data-source';
import { NubefactOseProvider } from '../src/modules/facturacion/ose/nubefact-ose.provider';
import { contextoActual } from '../src/database/tenant-context';
import { comprobanteElectronicoRepository } from '../src/modules/facturacion/facturacion.repository';
import { api, empresaConProducto } from './ayudantes';
import type { ResultadoOse } from '../src/modules/facturacion/ose/ose-provider.interface';
import type { QueryRunner } from 'typeorm';

/**
 * H13-B — Workflow seguro PREPARAR → COMMIT ANTICIPADO → OSE → FINALIZAR
 * (`facturacion.service.ts`). Cubre T-B01 a T-B26 según lo acordado para el cierre de H13.
 *
 * `facturacion.test.ts` ya cubre la configuración, los casos "felices" básicos (aceptado,
 * observado, rechazado) y la regresión H14 (venta anulada no llega al OSE, T01-T05 de ese
 * archivo = T-B22 acá) — este archivo se concentra en las garantías NUEVAS de H13: el punto
 * exacto donde se confirma la transacción, la clasificación de errores del OSE, el CAS de
 * FINALIZAR y la concurrencia entre emitir/reintentar/anular.
 */

function crearPfxDePrueba(contrasena: string): Buffer {
  const par = forge.pki.rsa.generateKeyPair(1024);
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = par.publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = new Date();
  certificado.validity.notAfter = new Date();
  certificado.validity.notAfter.setFullYear(certificado.validity.notBefore.getFullYear() + 1);
  const atributos = [{ name: 'commonName', value: 'EMPRESA DE PRUEBA H13B' }];
  certificado.setSubject(atributos);
  certificado.setIssuer(atributos);
  certificado.sign(par.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, certificado, contrasena, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

const CONTRASENA_CERTIFICADO = 'ClaveDePruebaH13B123';
const PFX_DE_PRUEBA = crearPfxDePrueba(CONTRASENA_CERTIFICADO);

let espiaOse: ReturnType<typeof vi.spyOn> | null = null;
let espiaQueryRunner: ReturnType<typeof vi.spyOn> | null = null;
afterEach(() => {
  espiaOse?.mockRestore();
  espiaOse = null;
  espiaQueryRunner?.mockRestore();
  espiaQueryRunner = null;
  vi.unstubAllGlobals();
});

function mockearRespuestaOse(resultado: ResultadoOse) {
  espiaOse = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockResolvedValue(resultado);
  return espiaOse;
}

async function empresaConFacturacionConfigurada(precio = 70) {
  const { sesion, catalogos, productoId } = await empresaConProducto(precio);

  await api
    .put('/api/facturacion/configuracion', sesion, {
      oseProveedor: 'nubefact',
      oseUsuario: 'usuario-prueba-h13b',
      oseClave: 'clave-prueba-h13b',
      ambiente: 'beta',
      activo: true,
    })
    .expect(200);

  await request(app)
    .post('/api/facturacion/configuracion/certificado')
    .set(sesion.h)
    .field('contrasena', CONTRASENA_CERTIFICADO)
    .attach('certificado', PFX_DE_PRUEBA, 'certificado.pfx')
    .expect(200);

  return { sesion, catalogos, productoId };
}

async function crearVentaFacturable(
  sesion: Awaited<ReturnType<typeof empresaConFacturacionConfigurada>>['sesion'],
  catalogos: Awaited<ReturnType<typeof empresaConFacturacionConfigurada>>['catalogos'],
  productoId: string,
) {
  return api
    .post('/api/ventas', sesion, {
      detalles: [{ productoId, cantidad: 1 }],
      tipoComprobanteId: catalogos.boletaId,
      formaPago: 'contado',
      medioPagoId: catalogos.efectivoId,
    })
    .expect(201);
}

interface FilaComprobante {
  id: string;
  estado: string;
  intentos: number;
  codigo_respuesta: string | null;
  mensaje_respuesta: string | null;
  cdr_xml: string | null;
  enviado_en: string | null;
  xml_firmado: string;
  hash_firma: string;
  nombre_archivo: string;
}

/** Lectura directa con bypass de RLS — no pasa por el `ALS` de la petición (que en varios de
 * estos tests ya está cerrado o intencionalmente ausente), igual que en `facturacion.test.ts`. */
async function leerComprobantesDeVentaDirecto(ventaId: string): Promise<FilaComprobante[]> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const filas = await queryRunner.query(
      `SELECT "id", "estado", "intentos", "codigo_respuesta", "mensaje_respuesta", "cdr_xml",
              "enviado_en", "xml_firmado", "hash_firma", "nombre_archivo"
       FROM "comprobantes_electronicos"
       WHERE "venta_id" = $1`,
      [ventaId],
    );
    await queryRunner.commitTransaction();
    return filas;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/** Simula, desde "fuera" del flujo (una conexión propia con bypass de RLS, nunca a través del
 * `ALS` de la petición), una escritura concurrente sobre un comprobante — para T-B14/T-B15,
 * donde hace falta que la fila cambie ENTRE el commit de PREPARAR y el CAS de FINALIZAR sin
 * pasar por ninguno de los dos. */
async function escribirComprobanteDirecto(
  id: string,
  cambios: { estado?: string; intentos?: number },
): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (cambios.estado !== undefined) {
      params.push(cambios.estado);
      sets.push(`"estado" = $${params.length}`);
    }
    if (cambios.intentos !== undefined) {
      params.push(cambios.intentos);
      sets.push(`"intentos" = $${params.length}`);
    }
    params.push(id);
    await queryRunner.query(
      `UPDATE "comprobantes_electronicos" SET ${sets.join(', ')} WHERE "id" = $${params.length}`,
      params,
    );
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

function crearBarrera() {
  let liberar!: () => void;
  const promesaLiberacion = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let marcarAlcanzado!: () => void;
  const promesaAlcanzado = new Promise<void>((resolve) => {
    marcarAlcanzado = resolve;
  });
  return { promesaLiberacion, liberar, promesaAlcanzado, marcarAlcanzado };
}

interface FallosQueryRunner {
  commit?: Error;
  release?: Error;
}

interface RastroQueryRunner {
  vecesCommit: number;
  vecesRollback: number;
  vecesRelease: number;
}

/**
 * `AppDataSource.createQueryRunner()` no solo lo llama la transacción HTTP de la petición que
 * cada test dispara — `auditoriaMiddleware` (`res.on('finish')`) abre su PROPIA conexión en
 * segundo plano para cada POST/PUT/PATCH/DELETE anterior (incluidos los de
 * `empresaConFacturacionConfigurada`/`crearVentaFacturable`), sin esperar a que termine antes
 * de responder. Esas escrituras de auditoría quedan intercaladas de forma no determinista con
 * las conexiones que SÍ importan para estos tests (confirmado con instrumentación: no es "una
 * sola rezagada", llegan escalonadas durante todo el test) — así que un espía que decide qué
 * conexión tocar por ORDEN DE LLAMADA (`mockImplementationOnce` en secuencia) es inherentemente
 * frágil acá.
 *
 * En su lugar, este espía queda SIEMPRE instalado (para todas las conexiones, indefinidamente,
 * hasta `restaurar()`) y decide, para cada conexión, si es "el objetivo" **por el contenido de
 * sus propias consultas**: recién inyecta el fallo de `commit`/`release` si esa conexión
 * concreta llegó a ejecutar una consulta que matchea `activarSi`. Una auditoría nunca toca
 * `"ventas"` con `FOR UPDATE` ni hace `UPDATE "comprobantes_electronicos"`, así que nunca se
 * marca a sí misma como objetivo — el patrón identifica la conexión por lo que realmente hizo,
 * no por cuándo se abrió. */
interface ReglaQueryRunner {
  activarSi: RegExp;
  fallos: FallosQueryRunner;
}

/** Variante de una sola regla, para el caso común (un único patrón a vigilar). */
function espiarQueryRunnerPorContenido(
  activarSi: RegExp,
  fallos: FallosQueryRunner,
): { rastro: RastroQueryRunner; restaurar: () => void } {
  const { rastros, restaurar } = espiarQueryRunnerPorReglas([{ activarSi, fallos }]);
  return { rastro: rastros[0]!, restaurar };
}

/** Varias reglas a la vez sobre el MISMO espía — necesario cuando un test necesita, por
 * ejemplo, seguir el rastro de la transacción HTTP (sin fallo) mientras inyecta un fallo en la
 * transacción propia de FINALIZAR: instalar dos espías por separado sobre el mismo método
 * (`AppDataSource.createQueryRunner`) sería frágil (el segundo `vi.spyOn` pisaría al primero). */
function espiarQueryRunnerPorReglas(reglas: ReglaQueryRunner[]): {
  rastros: RastroQueryRunner[];
  restaurar: () => void;
} {
  const rastros: RastroQueryRunner[] = reglas.map(() => ({
    vecesCommit: 0,
    vecesRollback: 0,
    vecesRelease: 0,
  }));
  const original = AppDataSource.createQueryRunner.bind(AppDataSource);
  const espia = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementation(() => {
    const queryRunner = original();
    let indiceObjetivo: number | null = null;
    const queryOriginal = queryRunner.query.bind(queryRunner);
    const commitOriginal = queryRunner.commitTransaction.bind(queryRunner);
    const rollbackOriginal = queryRunner.rollbackTransaction.bind(queryRunner);
    const releaseOriginal = queryRunner.release.bind(queryRunner);

    queryRunner.query = (async (...args: unknown[]) => {
      const sql = args[0];
      if (indiceObjetivo === null && typeof sql === 'string') {
        const i = reglas.findIndex((regla) => regla.activarSi.test(sql));
        if (i !== -1) indiceObjetivo = i;
      }
      // Reenvía TODOS los argumentos tal cual — `PostgresQueryRunner.query` acepta un tercer
      // parámetro (`useStructuredResult`) que algunas rutas internas de TypeORM sí usan (ej.
      // `SelectQueryBuilder.getRawAndEntities`); descartarlo rompe esas llamadas con un error
      // opaco ("Cannot read properties of undefined"), no relacionado con lo que este test
      // intenta verificar.
      return (queryOriginal as (...a: unknown[]) => unknown)(...args);
    }) as QueryRunner['query'];

    queryRunner.commitTransaction = (async () => {
      if (indiceObjetivo !== null) {
        rastros[indiceObjetivo]!.vecesCommit += 1;
        const fallo = reglas[indiceObjetivo]!.fallos.commit;
        if (fallo) throw fallo;
      }
      return commitOriginal();
    }) as QueryRunner['commitTransaction'];

    queryRunner.rollbackTransaction = (async () => {
      if (indiceObjetivo !== null) rastros[indiceObjetivo]!.vecesRollback += 1;
      return rollbackOriginal();
    }) as QueryRunner['rollbackTransaction'];

    let primeraLlamadaRelease = true;
    queryRunner.release = (async () => {
      if (indiceObjetivo !== null) {
        rastros[indiceObjetivo]!.vecesRelease += 1;
        const fallo = reglas[indiceObjetivo]!.fallos.release;
        if (fallo && primeraLlamadaRelease) {
          primeraLlamadaRelease = false;
          throw fallo;
        }
      }
      return releaseOriginal();
    }) as QueryRunner['release'];

    return queryRunner;
  });
  espiaQueryRunner = espia;
  return { rastros, restaurar: () => espia.mockRestore() };
}

/** Marcador único de la transacción HTTP de PREPARAR: es la única consulta con `FOR UPDATE`
 * que corre una emisión/reintento normal de facturación (el lock de Venta, ver
 * `facturacion.service.ts: prepararEmisionInicial`/`prepararReintento`). */
const MARCADOR_TRANSACCION_HTTP = /FOR UPDATE/;
/** Marcador único del CAS de FINALIZAR: ninguna otra conexión de estos tests escribe en esta
 * tabla con `UPDATE` (una primera emisión inserta; una auditoría nunca la toca). */
const MARCADOR_TRANSACCION_FINALIZAR = /UPDATE "comprobantes_electronicos"/;

describe('H13-B — casos base y clasificación de errores del OSE', () => {
  it('T-B01 — emisión normal aceptada: PREPARAR, commit anticipado, OSE, FINALIZAR', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ApplicationResponse>CDR</ApplicationResponse>',
    });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    const comprobante = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);

    expect(comprobante.body.data.estado).toBe('aceptado');
    expect(comprobante.body.data.intentos).toBe(1);
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('T-B02 — el commit de PREPARAR falla: no se llama al OSE, no queda comprobante durable', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    const errorCommit = new Error('Fallo simulado de commit en PREPARAR (T-B02)');
    const { rastro } = espiarQueryRunnerPorContenido(MARCADOR_TRANSACCION_HTTP, {
      commit: errorCommit,
    });

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);

    expect(respuesta.status).toBe(500);
    expect(espia).not.toHaveBeenCalled();
    expect(rastro.vecesCommit).toBe(1);
    expect(await leerComprobantesDeVentaDirecto(ventaId)).toHaveLength(0);
  });

  it('T-B03 — durante la llamada al OSE no existe ninguna transacción/QueryRunner de la petición activa', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    let manejadorDuranteOse: unknown = 'no-se-llamo';
    let queryRunnerDuranteOse: unknown = 'no-se-llamo';
    espiaOse = vi
      .spyOn(NubefactOseProvider.prototype, 'enviarComprobante')
      .mockImplementation(async () => {
        const contexto = contextoActual();
        manejadorDuranteOse = contexto?.manager ?? null;
        queryRunnerDuranteOse = contexto?.queryRunner ?? null;
        return { tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' };
      });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    await api.post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion).expect(200);

    expect(manejadorDuranteOse).toBeNull();
    expect(queryRunnerDuranteOse).toBeNull();
  });

  it('T-B04/T-B25 — OSE acepta pero el commit de FINALIZAR falla: HTTP 500, ENVIANDO sigue durable, reintento 409, sin segundo commit/rollback en la transacción HTTP', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    const errorCommitFinalizar = new Error('Fallo simulado de commit en FINALIZAR (T-B04)');
    const { rastros } = espiarQueryRunnerPorReglas([
      { activarSi: MARCADOR_TRANSACCION_HTTP, fallos: {} },
      { activarSi: MARCADOR_TRANSACCION_FINALIZAR, fallos: { commit: errorCommitFinalizar } },
    ]);

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);

    expect(respuesta.status).toBe(500);
    expect(espia).toHaveBeenCalledTimes(1);

    // La transacción HTTP (primera conexión, PREPARAR) confirmó una sola vez y nunca revirtió
    // — su commit anticipado ya era durable antes de que FINALIZAR fallara; `res.end()` al
    // enviar el 500 solo reutiliza ese cierre, sin un segundo commit/rollback/release.
    expect(rastros[0]?.vecesCommit).toBe(1);
    expect(rastros[0]?.vecesRollback).toBe(0);
    expect(rastros[0]?.vecesRelease).toBe(1);

    const filas = await leerComprobantesDeVentaDirecto(ventaId);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.estado).toBe('enviando');

    const reintento = await api.post(`/api/facturacion/comprobantes/${filas[0]!.id}/reintentar`, sesion);
    expect(reintento.status).toBe(409);
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('T-B05 — un fallo inequívoco antes de invocar el transporte deja error_envio, reintentable con el mismo XML', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({ tipo: 'no_transmitido', mensaje: 'No se pudo comprimir el XML' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    const primerIntento = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);
    expect(primerIntento.body.data.estado).toBe('error_envio');
    expect(primerIntento.body.data.intentos).toBe(1);

    espia.mockResolvedValue({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    const reintento = await api
      .post(`/api/facturacion/comprobantes/${primerIntento.body.data.id}/reintentar`, sesion)
      .expect(200);

    expect(reintento.body.data.estado).toBe('aceptado');
    expect(reintento.body.data.intentos).toBe(2);
    expect(reintento.body.data.xmlFirmado).toBe(primerIntento.body.data.xmlFirmado);
  });

  it('T-B06 — cualquier fallo desde la invocación del transporte en adelante queda resultado_incierto, no reintentable', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    mockearRespuestaOse({ tipo: 'incierta', mensaje: 'Timeout esperando la respuesta del OSE' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    const comprobante = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);
    expect(comprobante.body.data.estado).toBe('resultado_incierto');

    await api
      .post(`/api/facturacion/comprobantes/${comprobante.body.data.id}/reintentar`, sesion)
      .expect(409);
  });

  it('T-B06b — un TypeError("fetch failed") lanzado por el proveedor (contrato roto) también queda resultado_incierto, nunca error_envio', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    espiaOse = vi
      .spyOn(NubefactOseProvider.prototype, 'enviarComprobante')
      .mockRejectedValue(new TypeError('fetch failed'));
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    const comprobante = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);

    expect(comprobante.body.data.estado).toBe('resultado_incierto');
  });
});

/** Cobertura directa (sin HTTP, sin mock de `enviarComprobante`) de la clasificación REAL que
 * hace `NubefactOseProvider` cuando `fetch` mismo rechaza con `TypeError('fetch failed')` — el
 * caso explícitamente exigido para T-B06. Los tests de arriba prueban que el service reacciona
 * bien a un resultado `incierta`; este prueba que el proveedor produce ese resultado en primer
 * lugar ante ese error concreto. */
describe('NubefactOseProvider — clasificación real de un fetch roto', () => {
  it('TypeError("fetch failed") real (fetch global rechaza) se clasifica como incierta, no no_transmitido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    const resultado = await new NubefactOseProvider().enviarComprobante('<xml/>', 'ARCHIVO-PRUEBA', {
      usuario: 'usuario',
      clave: 'clave',
      ambiente: 'beta',
    });

    expect(resultado.tipo).toBe('incierta');
  });
});

describe('H13-B — concurrencia: emitir vs emitir, emitir vs anular', () => {
  it('T-B07 — dos emisiones concurrentes de la misma venta: el OSE se llama exactamente una vez', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    const ruta = `/api/facturacion/ventas/${ventaId}/emitir`;
    const [a, b] = await Promise.all([
      api.post(ruta, sesion).then((r) => r),
      api.post(ruta, sesion).then((r) => r),
    ]);

    const estados = [a.status, b.status].sort();
    expect(estados).toEqual([200, 409]);
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('T-B08 — emitir gana la carrera contra anular: mientras el envío está en curso (ENVIANDO durable), anular responde 409', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const barrera = crearBarrera();
    espiaOse = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockImplementation(async () => {
      barrera.marcarAlcanzado();
      await barrera.promesaLiberacion;
      return { tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' };
    });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    const promesaEmitir = api
      .post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion)
      .then((r) => r);
    // Si el mock ya fue invocado, PREPARAR ya confirmó de forma durable (ver T-B03: la
    // llamada al OSE solo ocurre después del commit anticipado) — el comprobante ya está en
    // `enviando` de forma durable en este punto, sin necesidad de esperar a que el OSE
    // "responda".
    await barrera.promesaAlcanzado;

    const respuestaAnular = await api.delete(`/api/ventas/${ventaId}`, sesion);
    expect(respuestaAnular.status).toBe(409);
    expect(respuestaAnular.body.message.toLowerCase()).toMatch(/en curso|sin resultado/);

    barrera.liberar();
    const respuestaEmitir = await promesaEmitir;
    expect(respuestaEmitir.status).toBe(200);
    expect(respuestaEmitir.body.data.estado).toBe('aceptado');
  });

  it('T-B09 — anular gana la carrera contra emitir: la venta ya anulada rechaza la emisión sin llamar al OSE', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    await api.delete(`/api/ventas/${ventaId}`, sesion).expect(200);
    const respuestaEmitir = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);

    expect(respuestaEmitir.status).toBe(409);
    expect(espia).not.toHaveBeenCalled();
  });
});

describe('H13-B — reintentos y bloqueo de anulación por estado del comprobante', () => {
  it('T-B10 — reintentar un error_envio reusa exactamente el mismo XML, hash y nombre de archivo', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({ tipo: 'no_transmitido', mensaje: 'Falla de preparación controlada' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    const primerIntento = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);

    espia.mockResolvedValue({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    const reintento = await api
      .post(`/api/facturacion/comprobantes/${primerIntento.body.data.id}/reintentar`, sesion)
      .expect(200);

    expect(reintento.body.data.xmlFirmado).toBe(primerIntento.body.data.xmlFirmado);
    expect(reintento.body.data.hashFirma).toBe(primerIntento.body.data.hashFirma);
    expect(reintento.body.data.nombreArchivo).toBe(primerIntento.body.data.nombreArchivo);
  });

  it('T-B11 — reintentar un comprobante en ENVIANDO responde 409 sin llamar al OSE', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const barrera = crearBarrera();
    const espia = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockImplementation(async () => {
      barrera.marcarAlcanzado();
      await barrera.promesaLiberacion;
      return { tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' };
    });
    espiaOse = espia;
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    const promesaEmitir = api
      .post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion)
      .then((r) => r);
    await barrera.promesaAlcanzado;

    const filas = await leerComprobantesDeVentaDirecto(ventaId);
    expect(filas[0]?.estado).toBe('enviando');

    const respuestaReintento = await api.post(
      `/api/facturacion/comprobantes/${filas[0]!.id}/reintentar`,
      sesion,
    );
    expect(respuestaReintento.status).toBe(409);
    expect(espia).toHaveBeenCalledTimes(1); // solo la emisión en curso, no el reintento

    barrera.liberar();
    await promesaEmitir;
  });

  it('T-B12 — reintentar un comprobante en resultado_incierto responde 409 sin llamar al OSE', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({ tipo: 'incierta', mensaje: 'Timeout' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    const comprobante = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);
    expect(comprobante.body.data.estado).toBe('resultado_incierto');
    espia.mockClear();

    await api
      .post(`/api/facturacion/comprobantes/${comprobante.body.data.id}/reintentar`, sesion)
      .expect(409);
    expect(espia).not.toHaveBeenCalled();
  });

  it('T-B13 — ENVIANDO y RESULTADO_INCIERTO bloquean la anulación de la venta', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();

    // Caso resultado_incierto (terminal, sin barrera).
    mockearRespuestaOse({ tipo: 'incierta', mensaje: 'Timeout' });
    const ventaIncierta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaIdIncierta = ventaIncierta.body.data.id as string;
    await api.post(`/api/facturacion/ventas/${ventaIdIncierta}/emitir`, sesion).expect(200);
    const respuestaAnularIncierta = await api.delete(`/api/ventas/${ventaIdIncierta}`, sesion);
    expect(respuestaAnularIncierta.status).toBe(409);
    espiaOse?.mockRestore();
    espiaOse = null;

    // Caso enviando (con barrera, ver T-B08).
    const barrera = crearBarrera();
    espiaOse = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockImplementation(async () => {
      barrera.marcarAlcanzado();
      await barrera.promesaLiberacion;
      return { tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' };
    });
    const ventaEnviando = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaIdEnviando = ventaEnviando.body.data.id as string;
    const promesaEmitir = api
      .post(`/api/facturacion/ventas/${ventaIdEnviando}/emitir`, sesion)
      .then((r) => r);
    await barrera.promesaAlcanzado;

    const respuestaAnularEnviando = await api.delete(`/api/ventas/${ventaIdEnviando}`, sesion);
    expect(respuestaAnularEnviando.status).toBe(409);

    barrera.liberar();
    await promesaEmitir;
  });
});

describe('H13-B — CAS obligatorio en FINALIZAR', () => {
  it('T-B14 — un intento (`intentos`) desactualizado no coincide con el CAS: no sobrescribe, responde 500', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    espiaOse = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockImplementation(async () => {
      const [fila] = await leerComprobantesDeVentaDirecto(ventaId);
      // Simula que otro proceso ya avanzó el número de intento de esta misma fila mientras el
      // OSE estaba "en vuelo" — nunca pasa por el ALS de la petición (que en este punto ya
      // está cerrado, ver T-B03), solo por la conexión directa de bypass RLS.
      await escribirComprobanteDirecto(fila!.id, { intentos: fila!.intentos + 5 });
      return { tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' };
    });

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);
    expect(respuesta.status).toBe(500);

    const filas = await leerComprobantesDeVentaDirecto(ventaId);
    // Sigue en `enviando` con el `intentos` que dejó la escritura "concurrente" — el resultado
    // del OSE (que hubiera puesto `aceptado`/`codigo_respuesta: '0'`) nunca se escribió encima.
    expect(filas[0]?.estado).toBe('enviando');
    expect(filas[0]?.codigo_respuesta).toBeNull();
  });

  it('T-B15 — un estado ya terminal (no `enviando`) no coincide con el CAS: no sobrescribe, responde 500', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    espiaOse = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockImplementation(async () => {
      const [fila] = await leerComprobantesDeVentaDirecto(ventaId);
      // Simula que otro FINALIZAR concurrente ya resolvió esta fila a un estado terminal
      // distinto, con el MISMO número de intento — el CAS de este FINALIZAR debe fallar por el
      // `estado`, no solo por `intentos`.
      await escribirComprobanteDirecto(fila!.id, { estado: 'rechazado' });
      return { tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado (nunca debe aplicarse)', cdrXml: '<ok/>' };
    });

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);
    expect(respuesta.status).toBe(500);

    const filas = await leerComprobantesDeVentaDirecto(ventaId);
    expect(filas[0]?.estado).toBe('rechazado');
    expect(filas[0]?.codigo_respuesta).toBeNull();
  });
});

describe('H13-B — aislamiento entre empresas, ALS y resiliencia de infraestructura', () => {
  it('T-B16 — FINALIZAR respeta RLS: dos empresas emitiendo a la vez nunca cruzan resultados', async () => {
    const empresaA = await empresaConFacturacionConfigurada();
    const empresaB = await empresaConFacturacionConfigurada();

    const espia = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockImplementation(async function (
      this: NubefactOseProvider,
      _xml: string,
      nombreArchivo: string,
    ) {
      return {
        tipo: 'definitiva',
        codigoRespuesta: '0',
        mensaje: `Aceptado para ${nombreArchivo}`,
        cdrXml: `<cdr>${nombreArchivo}</cdr>`,
      };
    });
    espiaOse = espia;

    const ventaA = await crearVentaFacturable(empresaA.sesion, empresaA.catalogos, empresaA.productoId);
    const ventaB = await crearVentaFacturable(empresaB.sesion, empresaB.catalogos, empresaB.productoId);

    const [respuestaA, respuestaB] = await Promise.all([
      api.post(`/api/facturacion/ventas/${ventaA.body.data.id}/emitir`, empresaA.sesion).then((r) => r),
      api.post(`/api/facturacion/ventas/${ventaB.body.data.id}/emitir`, empresaB.sesion).then((r) => r),
    ]);

    expect(respuestaA.status).toBe(200);
    expect(respuestaB.status).toBe(200);
    expect(respuestaA.body.data.nombreArchivo).not.toBe(respuestaB.body.data.nombreArchivo);
    expect(respuestaA.body.data.mensajeRespuesta).toContain(respuestaA.body.data.nombreArchivo);
    expect(respuestaB.body.data.mensajeRespuesta).toContain(respuestaB.body.data.nombreArchivo);

    // Cada empresa solo ve su propio comprobante a través de la API (RLS real, no un mock).
    const vistoPorA = await api
      .get(`/api/facturacion/ventas/${ventaA.body.data.id}`, empresaA.sesion)
      .expect(200);
    expect(vistoPorA.body.data.id).toBe(respuestaA.body.data.id);
    const vistoPorBSobreVentaDeA = await api.get(
      `/api/facturacion/ventas/${ventaA.body.data.id}`,
      empresaB.sesion,
    );
    expect(vistoPorBSobreVentaDeA.body.data).toBeNull();
  });

  it('T-B17 — durante la llamada al OSE, un repositorio consciente de empresa sigue lanzando (sin fallback global)', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    let vioExcepcion = false;
    let mensaje = '';
    espiaOse = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockImplementation(async () => {
      try {
        await comprobanteElectronicoRepository.find();
      } catch (error) {
        vioExcepcion = true;
        mensaje = error instanceof Error ? error.message : String(error);
      }
      return { tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' };
    });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    await api.post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion).expect(200);

    expect(vioExcepcion).toBe(true);
    expect(mensaje).toMatch(/ya fue confirmada/i);
  });

  it('T-B19 — commit anticipado exitoso + release de esa conexión falla: el OSE se llama igual, el resultado sigue siendo aceptado', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    const errorRelease = new Error('Fallo simulado de release tras commit anticipado exitoso (T-B19)');
    espiarQueryRunnerPorContenido(MARCADOR_TRANSACCION_HTTP, { release: errorRelease });

    const respuesta = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);

    expect(respuesta.body.data.estado).toBe('aceptado');
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('T-B20 — la transacción HTTP confirma exactamente una vez; res.end() no dispara un segundo commit', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    const { rastro } = espiarQueryRunnerPorContenido(MARCADOR_TRANSACCION_HTTP, {});

    await api.post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion).expect(200);

    expect(rastro.vecesCommit).toBe(1);
    expect(rastro.vecesRollback).toBe(0);
  });

  it('T-B24 — dos reintentos concurrentes del mismo comprobante en error_envio: el OSE se llama exactamente una vez', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({ tipo: 'no_transmitido', mensaje: 'Falla de preparación controlada' });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);

    const primerIntento = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);
    expect(primerIntento.body.data.estado).toBe('error_envio');

    espia.mockResolvedValue({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    espia.mockClear();

    const ruta = `/api/facturacion/comprobantes/${primerIntento.body.data.id}/reintentar`;
    const [a, b] = await Promise.all([
      api.post(ruta, sesion).then((r) => r),
      api.post(ruta, sesion).then((r) => r),
    ]);

    const estados = [a.status, b.status].sort();
    expect(estados).toEqual([200, 409]);
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('T-B26 — el connect() de la transacción propia de FINALIZAR falla: preserva el error causal, libera lo que se pueda, sin CAS aplicado', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    // A diferencia de commit/release (detectables por el CONTENIDO de las consultas que ya
    // corrieron sobre esa conexión), un fallo de `connect()` tiene que decidirse ANTES de que
    // exista ninguna consulta — no hay nada que inspeccionar todavía. En su lugar, se "arma" el
    // fallo justo al entrar al mock del OSE: `invocarOse` ya se ejecuta después del commit
    // anticipado (T-B03), así que la siguiente `createQueryRunner()` sin ningún `await` de por
    // medio es, necesariamente, la de `ejecutarEnTransaccionPropia` en `finalizarEnvio` — sin
    // ninguna ventana real donde una auditoría en segundo plano pueda colarse en el medio.
    const errorConnect = new Error('Fallo simulado de connect() en FINALIZAR (T-B26)');
    let armado = false;
    const rastro = { vecesConnect: 0, vecesStartTransaction: 0, vecesCommit: 0, vecesRelease: 0 };
    const original = AppDataSource.createQueryRunner.bind(AppDataSource);
    espiaQueryRunner = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementation(() => {
      if (!armado) return original();
      armado = false;
      const queryRunner = original();
      const startOriginal = queryRunner.startTransaction.bind(queryRunner);
      const commitOriginal = queryRunner.commitTransaction.bind(queryRunner);
      const releaseOriginal = queryRunner.release.bind(queryRunner);
      queryRunner.connect = (async () => {
        rastro.vecesConnect += 1;
        throw errorConnect;
      }) as QueryRunner['connect'];
      queryRunner.startTransaction = (async (nivel?: unknown) => {
        rastro.vecesStartTransaction += 1;
        return startOriginal(nivel as Parameters<QueryRunner['startTransaction']>[0]);
      }) as QueryRunner['startTransaction'];
      queryRunner.commitTransaction = (async () => {
        rastro.vecesCommit += 1;
        return commitOriginal();
      }) as QueryRunner['commitTransaction'];
      queryRunner.release = (async () => {
        rastro.vecesRelease += 1;
        return releaseOriginal();
      }) as QueryRunner['release'];
      return queryRunner;
    });

    espiaOse = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockImplementation(async () => {
      armado = true;
      return { tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' };
    });

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);

    expect(respuesta.status).toBe(500);
    expect(rastro.vecesConnect).toBe(1);
    expect(rastro.vecesStartTransaction).toBe(0);
    expect(rastro.vecesCommit).toBe(0);
    expect(rastro.vecesRelease).toBe(1); // liberación best-effort, incluso sin connect exitoso

    const filas = await leerComprobantesDeVentaDirecto(ventaId);
    expect(filas[0]?.estado).toBe('enviando'); // ningún CAS llegó a aplicarse
    expect(filas[0]?.codigo_respuesta).toBeNull();
  });
});

/**
 * H13B-04 — cobertura directa (sin HTTP, sin mock de `enviarComprobante`) de la clasificación
 * REAL que hace `NubefactOseProvider` ante resultados ambiguos posteriores a `fetch()`. Todos
 * deben clasificarse `incierta`, nunca `no_transmitido` — ver la regla ya documentada en
 * `ose-provider.interface.ts` y `nubefact-ose.provider.ts`, que este bloque solo verifica, sin
 * cambiarla.
 */
describe('NubefactOseProvider — clasificación directa de resultados ambiguos posteriores a fetch() (H13B-04)', () => {
  const CREDENCIALES_DE_PRUEBA = { usuario: 'usuario', clave: 'clave', ambiente: 'beta' as const };

  it('SOAP ilegible (texto plano sin ninguna etiqueta reconocible) se clasifica como incierta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ text: async () => 'esto no es XML ni SOAP, solo texto plano' }),
    );

    const resultado = await new NubefactOseProvider().enviarComprobante(
      '<xml/>',
      'ARCHIVO-PRUEBA',
      CREDENCIALES_DE_PRUEBA,
    );

    expect(resultado.tipo).toBe('incierta');
  });

  it('SOAP Fault sin <cod> (sin código de negocio SUNAT extraíble) se clasifica como incierta', async () => {
    const soapFaultSinCod = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <soapenv:Fault>
      <faultcode>soapenv:Server</faultcode>
      <faultstring>Error interno del servidor OSE</faultstring>
    </soapenv:Fault>
  </soapenv:Body>
</soapenv:Envelope>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => soapFaultSinCod }));

    const resultado = await new NubefactOseProvider().enviarComprobante(
      '<xml/>',
      'ARCHIVO-PRUEBA',
      CREDENCIALES_DE_PRUEBA,
    );

    expect(resultado.tipo).toBe('incierta');
    expect(resultado.mensaje).toContain('Error interno del servidor OSE');
  });

  it('CDR/ZIP inválido o indescifrable dentro de un applicationResponse aceptado se clasifica como incierta', async () => {
    const zipInvalidoBase64 = Buffer.from('esto no es un archivo zip válido').toString('base64');
    const respuestaConCdrInvalido = `<applicationResponse>${zipInvalidoBase64}</applicationResponse>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => respuestaConCdrInvalido }));

    const resultado = await new NubefactOseProvider().enviarComprobante(
      '<xml/>',
      'ARCHIVO-PRUEBA',
      CREDENCIALES_DE_PRUEBA,
    );

    expect(resultado.tipo).toBe('incierta');
  });

  it('un fallo al ejecutar respuesta.text() (conexión cortada a mitad de la respuesta) se clasifica como incierta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        text: async () => {
          throw new Error('conexión cortada a mitad de la respuesta');
        },
      }),
    );

    const resultado = await new NubefactOseProvider().enviarComprobante(
      '<xml/>',
      'ARCHIVO-PRUEBA',
      CREDENCIALES_DE_PRUEBA,
    );

    expect(resultado.tipo).toBe('incierta');
  });

  it('fetch() rechaza con TypeError("fetch failed") se clasifica como incierta (regresión, ya cubierta arriba)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const resultado = await new NubefactOseProvider().enviarComprobante(
      '<xml/>',
      'ARCHIVO-PRUEBA',
      CREDENCIALES_DE_PRUEBA,
    );

    expect(resultado.tipo).toBe('incierta');
  });
});
