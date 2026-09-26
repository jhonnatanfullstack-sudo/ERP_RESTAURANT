import { describe, expect, it, vi, afterEach } from 'vitest';
import request from 'supertest';
import forge from 'node-forge';
import { app } from '../src/app';
import { AppDataSource } from '../src/database/data-source';
import { NubefactOseProvider } from '../src/modules/facturacion/ose/nubefact-ose.provider';
import * as tenantContext from '../src/database/tenant-context';
import * as facturaBuilder from '../src/modules/facturacion/ubl/factura.builder';
import * as firmador from '../src/modules/facturacion/firma/firmador';
import { api, empresaConProducto } from './ayudantes';
import type { ResultadoOse } from '../src/modules/facturacion/ose/ose-provider.interface';
import type { QueryRunner } from 'typeorm';

/**
 * H13-B.1 — correcciones aplicadas a `facturacion.service.ts` tras la revisión independiente
 * de Codex sobre H13-B (observaciones H13B-01 a H13B-03). Vive en su propio archivo, separado
 * de `facturacion-h13b.test.ts` (T-B01 a T-B26): ese archivo ya corre cerca del límite global
 * de peticiones por IP (`app.ts`, 300 cada 15 minutos, compartido por todos los tests de un
 * mismo archivo porque todos reusan la misma instancia de `app`) — sumarle estos tres tests
 * (cada uno crea una empresa, un producto, una venta y de 1 a 3 llamadas de emisión/reintento)
 * lo hacía superar el límite y fallar con 429, no por ningún defecto de la lógica probada.
 */

function crearPfxDePrueba(contrasena: string): Buffer {
  const par = forge.pki.rsa.generateKeyPair(1024);
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = par.publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = new Date();
  certificado.validity.notAfter = new Date();
  certificado.validity.notAfter.setFullYear(certificado.validity.notBefore.getFullYear() + 1);
  const atributos = [{ name: 'commonName', value: 'EMPRESA DE PRUEBA H13B.1' }];
  certificado.setSubject(atributos);
  certificado.setIssuer(atributos);
  certificado.sign(par.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, certificado, contrasena, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

const CONTRASENA_CERTIFICADO = 'ClaveDePruebaH13B1123';
const PFX_DE_PRUEBA = crearPfxDePrueba(CONTRASENA_CERTIFICADO);

let espiaOse: ReturnType<typeof vi.spyOn> | null = null;
let espiaQueryRunner: ReturnType<typeof vi.spyOn> | null = null;
let espiaConfirmar: ReturnType<typeof vi.spyOn> | null = null;
let espiaConstruirXml: ReturnType<typeof vi.spyOn> | null = null;
let espiaFirmarXml: ReturnType<typeof vi.spyOn> | null = null;
afterEach(() => {
  espiaOse?.mockRestore();
  espiaOse = null;
  espiaQueryRunner?.mockRestore();
  espiaQueryRunner = null;
  espiaConfirmar?.mockRestore();
  espiaConfirmar = null;
  espiaConstruirXml?.mockRestore();
  espiaConstruirXml = null;
  espiaFirmarXml?.mockRestore();
  espiaFirmarXml = null;
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
      oseUsuario: 'usuario-prueba-h13b1',
      oseClave: 'clave-prueba-h13b1',
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

/** Lectura directa con bypass de RLS — igual que en `facturacion-h13b.test.ts`. */
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

describe('H13-B.1 — correcciones tras la revisión independiente de Codex', () => {
  it('T-B27 — H13B-01: una segunda llamada a /emitir sobre un comprobante en error_envio se rechaza sin regenerar XML/firma; /reintentar sigue reusando los mismos artefactos', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({
      tipo: 'no_transmitido',
      mensaje: 'Falla de preparación controlada (T-B27)',
    });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    const primerIntento = await api
      .post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion)
      .expect(200);
    expect(primerIntento.body.data.estado).toBe('error_envio');
    expect(primerIntento.body.data.intentos).toBe(1);

    // A partir de acá ninguna llamada a /emitir debe volver a construir ni firmar el XML: el
    // único camino de reenvío para error_envio es /reintentar (H13B-01).
    espiaConstruirXml = vi.spyOn(facturaBuilder, 'construirXmlFactura');
    espiaFirmarXml = vi.spyOn(firmador, 'firmarXml');
    espia.mockClear();

    const segundaEmision = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);
    expect(segundaEmision.status).toBe(409);
    expect(espiaConstruirXml).not.toHaveBeenCalled();
    expect(espiaFirmarXml).not.toHaveBeenCalled();
    expect(espia).not.toHaveBeenCalled(); // tampoco hay una segunda llamada al OSE

    const filas = await leerComprobantesDeVentaDirecto(ventaId);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.estado).toBe('error_envio');
    expect(filas[0]?.intentos).toBe(1);
    expect(filas[0]?.xml_firmado).toBe(primerIntento.body.data.xmlFirmado);
    expect(filas[0]?.hash_firma).toBe(primerIntento.body.data.hashFirma);
    expect(filas[0]?.nombre_archivo).toBe(primerIntento.body.data.nombreArchivo);

    // El camino normal de reenvío sigue funcionando y sigue reutilizando el XML original.
    espia.mockResolvedValue({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });
    const reintento = await api
      .post(`/api/facturacion/comprobantes/${primerIntento.body.data.id}/reintentar`, sesion)
      .expect(200);
    expect(reintento.body.data.estado).toBe('aceptado');
    expect(reintento.body.data.intentos).toBe(2);
    expect(reintento.body.data.xmlFirmado).toBe(primerIntento.body.data.xmlFirmado);
    expect(reintento.body.data.hashFirma).toBe(primerIntento.body.data.hashFirma);
    expect(reintento.body.data.nombreArchivo).toBe(primerIntento.body.data.nombreArchivo);
    expect(espiaConstruirXml).not.toHaveBeenCalled();
    expect(espiaFirmarXml).not.toHaveBeenCalled();
  });

  it('T-B28 — H13B-02: invocarOse aborta y nunca llama al proveedor si la transacción de la petición sigue activa', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    // Reproduce, sin duplicar infraestructura, la anomalía exacta que esta defensa existe para
    // atajar: un llamador que llega a invocarOse SIN haber confirmado de verdad antes la
    // transacción de la petición — el contexto ALS sigue con `manager` activo cuando el service
    // llega a la llamada al OSE. Espiar `confirmarTransaccionDeLaPeticion` (en vez de manipular
    // el ALS a mano) reusa el único mecanismo de contexto que ya existe (`tenant-context.ts`).
    espiaConfirmar = vi
      .spyOn(tenantContext, 'confirmarTransaccionDeLaPeticion')
      .mockResolvedValue(undefined);

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);

    expect(respuesta.status).toBe(500);
    expect(espia).not.toHaveBeenCalled();
  });

  it('T-B29 — H13B-03: OSE acepta pero el set_config de FINALIZAR falla: sin CAS aplicado, comprobante durablemente en enviando', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const venta = await crearVentaFacturable(sesion, catalogos, productoId);
    const ventaId = venta.body.data.id as string;

    // Mismo principio que T-B26 (`facturacion-h13b.test.ts`): se arma el fallo justo al entrar
    // al mock del OSE, así que la siguiente `createQueryRunner()` sin ningún `await` de por
    // medio es, necesariamente, la de `ejecutarEnTransaccionPropia` en `finalizarEnvio` (T-B03
    // ya garantiza que no hay ninguna conexión de la petición activa en ese punto). A
    // diferencia de T-B26 (que rompe `connect()`), acá `connect()` y `startTransaction()`
    // corren normalmente y el fallo se inyecta específicamente en la consulta
    // `set_config('app.empresa_id', ...)`.
    const errorSetConfig = new Error('Fallo simulado de set_config en FINALIZAR (T-B29)');
    let armado = false;
    const rastro = {
      vecesConnect: 0,
      vecesStartTransaction: 0,
      vecesSetConfigEmpresa: 0,
      vecesCommit: 0,
      vecesRollback: 0,
      vecesRelease: 0,
    };
    const original = AppDataSource.createQueryRunner.bind(AppDataSource);
    espiaQueryRunner = vi.spyOn(AppDataSource, 'createQueryRunner').mockImplementation(() => {
      if (!armado) return original();
      armado = false;
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
      queryRunner.query = (async (...args: unknown[]) => {
        const sql = args[0];
        if (typeof sql === 'string' && /set_config\('app\.empresa_id'/.test(sql)) {
          rastro.vecesSetConfigEmpresa += 1;
          throw errorSetConfig;
        }
        return (queryOriginal as (...a: unknown[]) => unknown)(...args);
      }) as QueryRunner['query'];
      queryRunner.commitTransaction = (async () => {
        rastro.vecesCommit += 1;
        return commitOriginal();
      }) as QueryRunner['commitTransaction'];
      queryRunner.rollbackTransaction = (async () => {
        rastro.vecesRollback += 1;
        return rollbackOriginal();
      }) as QueryRunner['rollbackTransaction'];
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
    // `vecesConnect` no se compara con un número exacto: el driver de Postgres de TypeORM llama
    // a `this.connect()` internamente (de forma idempotente, sin reconectar) desde varios de
    // sus propios métodos (`startTransaction`, `query`), así que un solo `connect()` explícito
    // de `ejecutarConConexionPropia` ya cuenta varias veces acá — es un detalle interno de
    // TypeORM, no una señal de esta prueba. Lo que sí importa: se conectó al menos una vez.
    expect(rastro.vecesConnect).toBeGreaterThanOrEqual(1);
    expect(rastro.vecesStartTransaction).toBe(1);
    expect(rastro.vecesSetConfigEmpresa).toBe(1);
    expect(rastro.vecesCommit).toBe(0); // el CAS (el UPDATE) nunca llegó a correr
    expect(rastro.vecesRollback).toBe(1);
    expect(rastro.vecesRelease).toBe(1);

    const filas = await leerComprobantesDeVentaDirecto(ventaId);
    expect(filas[0]?.estado).toBe('enviando'); // ningún CAS llegó a aplicarse
    expect(filas[0]?.codigo_respuesta).toBeNull();
  });
});
