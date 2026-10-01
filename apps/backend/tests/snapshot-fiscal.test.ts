import { describe, expect, it, vi, afterEach } from 'vitest';
import forge from 'node-forge';
import { Client } from 'pg';
import { AppDataSource } from '../src/database/data-source';
import { env } from '../src/config/env';
import { NubefactOseProvider } from '../src/modules/facturacion/ose/nubefact-ose.provider';
import { api, empresaConProducto } from './ayudantes';
import type { ResultadoOse } from '../src/modules/facturacion/ose/ose-provider.interface';
import type { QueryRunner } from 'typeorm';

/**
 * H16 — `venta.service.ts: crearVenta` congela ahora un snapshot fiscal propio de Empresa/
 * Cliente/tasa IGV (`Venta.snapshotFiscalVersion = 1` + columnas `snapshotEmpresa*`/
 * `snapshotCliente*`/`snapshotTasaIgv`) en el mismo instante en que se crea la venta.
 * `facturacion.service.ts: prepararEmisionInicial` usa EXCLUSIVAMENTE ese snapshot para
 * construir el XML de la primera emisión de una venta con ese contrato — nunca la relación
 * viva `venta.empresa`/`venta.cliente` ni `resolverTasaIgv()` contra el régimen vigente de la
 * Empresa — así que editar Empresa/Cliente (o su régimen IGV) entre la venta y la emisión (que
 * puede ocurrir días o semanas después, por diseño) ya no cambia el comprobante de esa venta.
 *
 * Revisión independiente (Codex) sobre la primera versión de H16 encontró tres hallazgos que
 * estos tests también cubren:
 * - H16D-01 (HIGH) — la tasa IGV del `<cbc:Percent>` seguía derivándose de la Empresa VIVA.
 * - H16D-02 (MEDIUM) — el snapshot de Cliente no se validaba: un snapshot corrupto podía
 *   degradar en silencio una factura/boleta con cliente real a "CLIENTE VARIOS".
 * - H16D-03 (LOW) — cualquier `snapshotFiscalVersion` distinta de `1` cae como legacy; debe
 *   fallar cerrado en vez de tratarse como tal.
 *
 * Estos tests reproducen el flujo real completo vía HTTP (`/api/ventas`, `/api/clientes`,
 * `/api/empresas`, `/api/facturacion/ventas/:id/emitir`) — no se salta `prepararEmisionInicial`
 * ni se reconstruye nada a mano. Antes de H16-B, los de `Cliente`/`Empresa` eran el RED que
 * confirmó el hallazgo original: `Expected: valor histórico`, `Received: valor nuevo`.
 *
 * Los tests de "legacy"/"fail-closed"/"versión desconocida" necesitan simular estados que el
 * flujo normal de la API ya no puede producir por sí solo — usan el mismo bypass de RLS por
 * `QueryRunner` directo que ya emplea `factura-payment-terms.test.ts` para simular XML
 * histórico pre-H15.
 */

function crearPfxDePrueba(contrasena: string): Buffer {
  const par = forge.pki.rsa.generateKeyPair(1024);
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = par.publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = new Date();
  certificado.validity.notAfter = new Date();
  certificado.validity.notAfter.setFullYear(certificado.validity.notBefore.getFullYear() + 1);
  const atributos = [{ name: 'commonName', value: 'EMPRESA DE PRUEBA H16' }];
  certificado.setSubject(atributos);
  certificado.setIssuer(atributos);
  certificado.sign(par.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, certificado, contrasena, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

const CONTRASENA_CERTIFICADO = 'ClaveDePruebaH16123';
const PFX_DE_PRUEBA = crearPfxDePrueba(CONTRASENA_CERTIFICADO);

let espiaOse: ReturnType<typeof vi.spyOn> | null = null;
afterEach(() => {
  espiaOse?.mockRestore();
  espiaOse = null;
});

function mockearRespuestaOse(resultado: ResultadoOse) {
  espiaOse = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockResolvedValue(resultado);
  return espiaOse;
}

/** Mismo patrón que `factura-payment-terms.test.ts`/`facturacion-h13b1.test.ts`: empresa con
 * OSE configurado y certificado cargado, lista para `/emitir` real. */
async function empresaConFacturacionConfigurada(precio = 100) {
  const { sesion, catalogos, productoId } = await empresaConProducto(precio);

  await api
    .put('/api/facturacion/configuracion', sesion, {
      oseProveedor: 'nubefact',
      oseUsuario: 'usuario-prueba-h16',
      oseClave: 'clave-prueba-h16',
      ambiente: 'beta',
      activo: true,
    })
    .expect(200);

  const { default: request } = await import('supertest');
  const { app } = await import('../src/app.js');
  await request(app)
    .post('/api/facturacion/configuracion/certificado')
    .set(sesion.h)
    .field('contrasena', CONTRASENA_CERTIFICADO)
    .attach('certificado', PFX_DE_PRUEBA, 'certificado.pfx')
    .expect(200);

  return { sesion, catalogos, productoId };
}

/** Bypass de RLS por `QueryRunner` directo — mismo mecanismo ya usado en
 * `factura-payment-terms.test.ts` para simular estados que el flujo normal de la API no puede
 * producir por sí solo. */
async function conBypassRls<T>(accion: (queryRunner: QueryRunner) => Promise<T>): Promise<T> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const resultado = await accion(queryRunner);
    await queryRunner.commitTransaction();
    return resultado;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function tiposDocumentoIdentidad(sesion: { h: Record<string, string> }) {
  const { default: request } = await import('supertest');
  const { app } = await import('../src/app.js');
  const respuesta = await request(app)
    .get('/api/catalogos/tipos-documento-identidad')
    .set(sesion.h)
    .expect(200);
  const tipos = respuesta.body.data as Array<{ id: string; codigo: string }>;
  return {
    dni: tipos.find((t) => t.codigo === '1')!,
    ruc: tipos.find((t) => t.codigo === '6')!,
  };
}

describe('H16 — el XML de la primera emisión refleja Empresa/Cliente vigentes al momento de la VENTA (snapshot fiscal propio, no la relación viva)', () => {
  it('Cliente cambia nombre, tipo de documento y número de documento después de la venta — el XML conserva los datos históricos', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    const tiposDoc = await tiposDocumentoIdentidad(sesion);

    // A — Cliente en su estado histórico, vigente al momento de la venta.
    const cliente = await api
      .post('/api/clientes', sesion, {
        nombres: 'HISTORICO',
        apellidos: 'CLIENTEUNO',
        tipoDocumentoIdentidadId: tiposDoc.dni.id,
        numeroDocumento: '11111111',
      })
      .expect(201);
    const clienteId = cliente.body.data.id as string;

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
        clienteId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // B — el cliente cambia de nombre Y de documento DESPUÉS de la venta, ANTES de la primera
    // emisión (el escenario explícito que H16 describe: "puede ocurrir días o semanas después").
    // RUC con prefijo "10" (persona natural con RUC), no "20": evita disparar la regla de
    // "RUC de empresa exige razón social" (`cliente.service.ts: esPersonaJuridica`), ajena a
    // lo que este test necesita demostrar.
    await api
      .put(`/api/clientes/${clienteId}`, sesion, {
        nombres: 'RENOMBRADO',
        apellidos: 'CLIENTEDOS',
        tipoDocumentoIdentidadId: tiposDoc.ruc.id,
        numeroDocumento: '10222222222',
      })
      .expect(200);

    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    const xml = emitida.body.data.xmlFirmado as string;

    // Valor histórico (A) conservado: nombre, y el documento — tipo Y número.
    expect(xml).toContain('HISTORICO CLIENTEUNO');
    expect(xml).toContain('11111111');
    expect(xml).toMatch(/<cbc:ID schemeID="1"[^>]*>11111111<\/cbc:ID>/);
    // Valor nuevo (B) — el comprobante no debe reflejarlo.
    expect(xml).not.toContain('RENOMBRADO CLIENTEDOS');
    expect(xml).not.toContain('10222222222');
  });

  it('Empresa cambia razón social, nombre comercial, dirección y ubigeo después de la venta — el XML conserva los datos históricos (H16D-05)', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });

    // A — Empresa en su estado histórico al momento de crear la venta. Incluye
    // `nombreComercial`/`ubigeo` (Codex, H16D-05: cobertura incompleta) además de
    // `razonSocial`/`direccionFiscal`, ya cubiertos.
    await api
      .put(`/api/empresas/${sesion.empresaId}`, sesion, {
        razonSocial: 'EMPRESA HISTORICA SAC',
        nombreComercial: 'HISTORICA COMERCIAL',
        direccionFiscal: 'AV HISTORICA 100',
        ubigeo: '150101',
      })
      .expect(200);

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // B — la empresa cambia los cuatro campos DESPUÉS de la venta, ANTES de la primera emisión.
    await api
      .put(`/api/empresas/${sesion.empresaId}`, sesion, {
        razonSocial: 'EMPRESA RENOMBRADA SAC',
        nombreComercial: 'NUEVA COMERCIAL',
        direccionFiscal: 'AV NUEVA 200',
        ubigeo: '040101',
      })
      .expect(200);

    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    const xml = emitida.body.data.xmlFirmado as string;

    expect(xml).toContain('EMPRESA HISTORICA SAC');
    expect(xml).toContain('HISTORICA COMERCIAL');
    expect(xml).toContain('AV HISTORICA 100');
    expect(xml).toContain('150101');
    expect(xml).not.toContain('EMPRESA RENOMBRADA SAC');
    expect(xml).not.toContain('NUEVA COMERCIAL');
    expect(xml).not.toContain('AV NUEVA 200');
    expect(xml).not.toContain('040101');
  });

  it('Empresa cambia de RUC después de la venta — el XML (y el nombre de archivo) conservan el RUC histórico', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });

    const antes = await api.get(`/api/empresas/${sesion.empresaId}`, sesion).expect(200);
    const rucHistorico = antes.body.data.ruc as string;

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // H16-A confirmó que `Empresa.ruc` es editable en el modelo actual (sin restricción de
    // dominio) — no se decide aquí si debería permitirse; solo se demuestra que, si ocurre, el
    // snapshot congela el RUC histórico.
    const rucNuevo = '20999999999';
    await api.put(`/api/empresas/${sesion.empresaId}`, sesion, { ruc: rucNuevo }).expect(200);

    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    const xml = emitida.body.data.xmlFirmado as string;

    expect(xml).toContain(rucHistorico);
    expect(xml).not.toContain(rucNuevo);
    // `nombreArchivo` usa el mismo RUC resuelto que el contenido del XML — nunca uno histórico
    // y otro vivo dentro del mismo comprobante.
    expect(emitida.body.data.nombreArchivo as string).toContain(rucHistorico);
    expect(emitida.body.data.nombreArchivo as string).not.toContain(rucNuevo);
  });

  it('Empresa cambia de régimen general (18%) a MYPE restaurantes (10.5%) después de la venta — el XML conserva la tasa histórica (H16D-01)', async () => {
    // Precio 118 con régimen general (18%) da números exactos: valorVenta=100.00, igv=18.00 —
    // más fácil de verificar sin arrastrar redondeos ajenos a lo que este test prueba.
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(118);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });

    // A — Empresa en régimen general (18%, default de `Empresa.acogidoRegimenMypeRestaurantes
    // = false`) al momento de crear la venta.
    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // Los importes se calcularon y congelaron a la tasa histórica (18%) — confirmado antes de
    // tocar el régimen de la Empresa.
    expect(venta.body.data.subtotal).toBe(100);
    expect(venta.body.data.igv).toBe(18);
    expect(venta.body.data.total).toBe(118);

    // B — la Empresa se acoge al régimen MYPE de restaurantes (10.5%) DESPUÉS de la venta,
    // ANTES de la primera emisión.
    await api
      .put(`/api/empresas/${sesion.empresaId}`, sesion, { acogidoRegimenMypeRestaurantes: true })
      .expect(200);

    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    const xml = emitida.body.data.xmlFirmado as string;

    // El `Percent` del XML debe seguir siendo el histórico (18.00), coherente con los importes
    // ya congelados (`TaxableAmount`=100.00, `TaxAmount`=18.00) — nunca el 10.50 del régimen
    // MYPE vigente al momento de emitir.
    expect(xml).toContain('<cbc:Percent>18.00</cbc:Percent>');
    expect(xml).not.toContain('<cbc:Percent>10.50</cbc:Percent>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="PEN">100.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxAmount currencyID="PEN">18.00</cbc:TaxAmount>');
  });
});

/** Limpia a `NULL` el snapshot fiscal completo de una venta, simulando una fila "legacy"
 * (creada antes de la migración H16) — el flujo normal de la API ya no puede producir esto por
 * sí solo, porque `crearVenta` siempre fija `snapshotFiscalVersion = 1`. */
async function convertirEnVentaLegacy(ventaId: string): Promise<void> {
  await conBypassRls((qr) =>
    qr.query(
      `UPDATE "ventas" SET
         "snapshot_fiscal_version" = NULL,
         "snapshot_empresa_ruc" = NULL,
         "snapshot_empresa_razon_social" = NULL,
         "snapshot_empresa_nombre_comercial" = NULL,
         "snapshot_empresa_ubigeo" = NULL,
         "snapshot_empresa_direccion_fiscal" = NULL,
         "snapshot_cliente_tipo_documento_codigo" = NULL,
         "snapshot_cliente_numero_documento" = NULL,
         "snapshot_cliente_razon_social" = NULL,
         "snapshot_cliente_nombres" = NULL,
         "snapshot_cliente_apellidos" = NULL
       WHERE "id" = $1`,
      [ventaId],
    ),
  );
}

describe('H16 — compatibilidad legacy: una venta sin snapshot (snapshotFiscalVersion = NULL) sigue pudiendo emitirse', () => {
  it('usa el comportamiento best-effort anterior a H16 (datos VIVOS de Empresa/Cliente) — sin afirmar que sea históricamente correcto', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });

    const cliente = await api
      .post('/api/clientes', sesion, { nombres: 'LEGACY', apellidos: 'CLIENTE' })
      .expect(201);
    const clienteId = cliente.body.data.id as string;

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
        clienteId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // Simula una fila pre-H16: sin snapshot alguno.
    await convertirEnVentaLegacy(ventaId);

    // No se demuestra "corrección histórica" (el dato real al momento de esa venta ya no es
    // reconstruible) — solo que la emisión NO se bloquea masivamente para ventas anteriores a
    // la migración, y que usa los datos vivos disponibles como compatibilidad best-effort.
    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    const xml = emitida.body.data.xmlFirmado as string;
    expect(xml).toContain('LEGACY CLIENTE');
  });
});

describe('H16 — fail-closed: snapshotFiscalVersion=1 con un campo obligatorio del snapshot incompleto no factura con datos vigentes como respaldo', () => {
  it('bloquea /emitir sin llamar al OSE ni crear un comprobante si falta snapshotEmpresaRazonSocial', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    const espia = mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // Corrompe deliberadamente el snapshot de esta venta H16: mantiene
    // `snapshotFiscalVersion = 1` (sigue declarando tener contrato H16 completo) pero borra
    // `razonSocial` — uno de los dos únicos campos obligatorios en `Empresa` misma (no un
    // campo legítimamente opcional como `nombreComercial`/`direccionFiscal`).
    await conBypassRls((qr) =>
      qr.query(`UPDATE "ventas" SET "snapshot_empresa_razon_social" = NULL WHERE "id" = $1`, [
        ventaId,
      ]),
    );

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);
    expect(respuesta.status).toBe(500);
    expect(espia).not.toHaveBeenCalled();

    // No quedó ningún comprobante a medio crear: el fallo ocurrió antes de firmar/persistir.
    const comprobante = await api.get(`/api/facturacion/ventas/${ventaId}`, sesion).expect(200);
    expect(comprobante.body.data).toBeNull();
  });
});

describe('H16D-02 — fail-closed: snapshot de Cliente incoherente no factura con el Cliente vigente como respaldo ni degrada a "CLIENTE VARIOS"', () => {
  it('boleta con cliente real y snapshot sin ningún nombre — bloquea /emitir, OSE no llamado, sin comprobante', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    const espia = mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const cliente = await api
      .post('/api/clientes', sesion, { nombres: 'REAL', apellidos: 'CLIENTE' })
      .expect(201);
    const clienteId = cliente.body.data.id as string;

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
        clienteId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // Corrompe el snapshot: borra TODO nombre (razón social/nombres/apellidos) sin tocar
    // tipo/número de documento (ya eran ambos NULL: cliente sin documento, legítimo para
    // boleta). Sin esta protección, el builder degradaría a "CLIENTE VARIOS" para una venta
    // que SÍ tenía un cliente real identificado.
    await conBypassRls((qr) =>
      qr.query(
        `UPDATE "ventas" SET
           "snapshot_cliente_razon_social" = NULL,
           "snapshot_cliente_nombres" = NULL,
           "snapshot_cliente_apellidos" = NULL
         WHERE "id" = $1`,
        [ventaId],
      ),
    );

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);
    expect(respuesta.status).toBe(500);
    expect(espia).not.toHaveBeenCalled();

    const comprobante = await api.get(`/api/facturacion/ventas/${ventaId}`, sesion).expect(200);
    expect(comprobante.body.data).toBeNull();
  });

  it('factura con cliente RUC real y snapshot de tipo de documento corrompido a DNI — bloquea /emitir sin degradar a consumidor final', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    const espia = mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });
    const tiposDoc = await tiposDocumentoIdentidad(sesion);

    // RUC con prefijo "10" (persona natural con RUC) — mismo motivo que en el test de Cliente
    // de arriba: usa `nombres`, no dispara la regla de persona jurídica.
    const cliente = await api
      .post('/api/clientes', sesion, {
        nombres: 'FACTURA',
        apellidos: 'CLIENTE',
        tipoDocumentoIdentidadId: tiposDoc.ruc.id,
        numeroDocumento: '10333333333',
      })
      .expect(201);
    const clienteId = cliente.body.data.id as string;

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.facturaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
        clienteId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // Corrompe SOLO el tipo de documento del snapshot (DNI en vez de RUC). Número de
    // documento y nombre quedan intactos a propósito: las reglas genéricas (tipo+número ambos
    // presentes, nombre presente) pasan sin problema — solo la regla específica de FACTURA
    // (exige RUC) debe detectar esto. No debe terminar con `schemeID="0"`, `documento="-"` ni
    // "CLIENTE VARIOS": la venta SÍ tenía un receptor real.
    await conBypassRls((qr) =>
      qr.query(`UPDATE "ventas" SET "snapshot_cliente_tipo_documento_codigo" = $1 WHERE "id" = $2`, [
        tiposDoc.dni.codigo,
        ventaId,
      ]),
    );

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);
    expect(respuesta.status).toBe(500);
    expect(espia).not.toHaveBeenCalled();

    const comprobante = await api.get(`/api/facturacion/ventas/${ventaId}`, sesion).expect(200);
    expect(comprobante.body.data).toBeNull();
  });
});

/**
 * Fuerza `snapshot_fiscal_version = 2` saltándose temporalmente el `CHECK` de Postgres — simula
 * que ese valor llegó por otra vía (una migración futura, una corrección manual) que lo hubiera
 * evitado, para poder probar la lógica del SERVICE de forma independiente del `CHECK` (ver
 * H16D-03). El `CHECK` se reinstala de inmediato con `NOT VALID` (no revalida las filas
 * existentes, que ya incluyen la fila corrupta) — nunca queda deshabilitado para el resto de la
 * suite, que comparte esta misma base de datos de pruebas.
 *
 * `ALTER TABLE`/`DROP CONSTRAINT` exige ser dueño de la tabla — el rol de la aplicación
 * (`DB_APP_USER`, el mismo que usa `AppDataSource`/`conBypassRls`) es deliberadamente
 * restringido y no lo es. Se conecta acá, solo para esta operación puntual, con el rol dueño
 * (`DB_USER`/`DB_PASSWORD` — las mismas credenciales que ya usa `migration-data-source.ts` para
 * las migraciones reales), en una conexión `pg` aparte y de corta vida.
 */
async function convertirEnVentaVersionDesconocida(ventaId: string): Promise<void> {
  const cliente = new Client({
    host: env.db.host,
    port: env.db.port,
    database: env.db.name,
    user: env.db.user,
    password: env.db.password,
  });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(`ALTER TABLE "ventas" DROP CONSTRAINT "CHK_ventas_snapshot_fiscal_version"`);
    await cliente.query(`UPDATE "ventas" SET "snapshot_fiscal_version" = 2 WHERE "id" = $1`, [
      ventaId,
    ]);
    await cliente.query(
      `ALTER TABLE "ventas" ADD CONSTRAINT "CHK_ventas_snapshot_fiscal_version" ` +
        `CHECK ("snapshot_fiscal_version" IS NULL OR "snapshot_fiscal_version" = 1) NOT VALID`,
    );
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await cliente.end();
  }
}

describe('H16D-03 — snapshotFiscalVersion desconocida (ni NULL ni 1) se rechaza, tanto a nivel de base de datos como en la lógica del service', () => {
  it('el CHECK de Postgres ya rechaza directamente un UPDATE a snapshotFiscalVersion=2', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    await expect(
      conBypassRls((qr) =>
        qr.query(`UPDATE "ventas" SET "snapshot_fiscal_version" = 2 WHERE "id" = $1`, [ventaId]),
      ),
    ).rejects.toThrow();
  });

  it('la lógica del service también rechaza snapshotFiscalVersion=2, de forma independiente del CHECK — no la trata como legacy ni llama al OSE', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    const espia = mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    await convertirEnVentaVersionDesconocida(ventaId);

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);
    expect(respuesta.status).toBe(500);
    expect(espia).not.toHaveBeenCalled();

    const comprobante = await api.get(`/api/facturacion/ventas/${ventaId}`, sesion).expect(200);
    expect(comprobante.body.data).toBeNull();
  });
});
