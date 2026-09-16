import { describe, expect, it, vi, afterEach } from 'vitest';
import request from 'supertest';
import forge from 'node-forge';
import { app } from '../src/app';
import { NubefactOseProvider } from '../src/modules/facturacion/ose/nubefact-ose.provider';
import { api, empresaConProducto } from './ayudantes';
import type { RespuestaOse } from '../src/modules/facturacion/ose/ose-provider.interface';

/**
 * Emisión de comprobantes electrónicos vía OSE (FASE 28). El `NubefactOseProvider` se
 * mockea con `vi.spyOn` en todos los casos: nunca se llama a un OSE real ni a SUNAT desde los
 * tests automáticos (solo se verificó manualmente contra el demo real de NubeFacT durante el
 * desarrollo, ver `docs/decisiones-tecnicas.md`).
 */

/** Empaqueta el mismo certificado autofirmado que usa `generarCertificadoPruebas` en un
 * `.pfx`/PKCS#12 real, para poder probar el endpoint de subida tal como lo usaría el frontend
 * (multipart, no JSON). */
function crearPfxDePrueba(contrasena: string): Buffer {
  const par = forge.pki.rsa.generateKeyPair(1024); // rápido en tests; nunca se usa para firmar de verdad
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = par.publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = new Date();
  certificado.validity.notAfter = new Date();
  certificado.validity.notAfter.setFullYear(certificado.validity.notBefore.getFullYear() + 1);
  const atributos = [{ name: 'commonName', value: 'EMPRESA DE PRUEBA' }];
  certificado.setSubject(atributos);
  certificado.setIssuer(atributos);
  certificado.sign(par.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, certificado, contrasena, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

const CONTRASENA_CERTIFICADO = 'ClaveDePrueba123';
const PFX_DE_PRUEBA = crearPfxDePrueba(CONTRASENA_CERTIFICADO);

function mockearRespuestaOse(respuesta: RespuestaOse) {
  return vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockResolvedValue(respuesta);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Deja una empresa con OSE configurado y certificado subido — lo que hace falta antes de
 * poder emitir cualquier comprobante. */
async function empresaConFacturacionConfigurada(precio = 70) {
  const { sesion, catalogos, productoId } = await empresaConProducto(precio);

  await api
    .put('/api/facturacion/configuracion', sesion, {
      oseProveedor: 'nubefact',
      oseUsuario: 'usuario-prueba',
      oseClave: 'clave-prueba',
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

describe('Configuración de facturación electrónica', () => {
  it('sin configurar nada, el estado es inactivo y sin certificado', async () => {
    const { sesion } = await empresaConProducto();
    const estado = await api.get('/api/facturacion/configuracion', sesion).expect(200);
    expect(estado.body.data.activo).toBe(false);
    expect(estado.body.data.tieneCertificado).toBe(false);
  });

  it('guarda el OSE y el certificado, y no exige mandar la clave de nuevo en cada guardado', async () => {
    const { sesion } = await empresaConFacturacionConfigurada();

    const estado = await api.get('/api/facturacion/configuracion', sesion).expect(200);
    expect(estado.body.data.oseProveedor).toBe('nubefact');
    expect(estado.body.data.tieneCredencialOse).toBe(true);
    expect(estado.body.data.tieneCertificado).toBe(true);
    expect(estado.body.data.certificadoValidoHasta).toBeTruthy();
    expect(estado.body.data.activo).toBe(true);

    // Cambiar solo el ambiente, sin volver a mandar oseClave, no debe borrar la credencial.
    await api.put('/api/facturacion/configuracion', sesion, { ambiente: 'produccion' }).expect(200);
    const trasEditar = await api.get('/api/facturacion/configuracion', sesion).expect(200);
    expect(trasEditar.body.data.tieneCredencialOse).toBe(true);
    expect(trasEditar.body.data.ambiente).toBe('produccion');
  });

  it('rechaza un certificado cuya contraseña no corresponde', async () => {
    const { sesion } = await empresaConProducto();

    await request(app)
      .post('/api/facturacion/configuracion/certificado')
      .set(sesion.h)
      .field('contrasena', 'contraseña-incorrecta')
      .attach('certificado', PFX_DE_PRUEBA, 'certificado.pfx')
      .expect(400);
  });

  it('la configuración de una empresa no se filtra a otra (RLS)', async () => {
    const { sesion: empresaA } = await empresaConFacturacionConfigurada();
    const { sesion: empresaB } = await empresaConProducto();

    const configA = await api.get('/api/facturacion/configuracion', empresaA).expect(200);
    const configB = await api.get('/api/facturacion/configuracion', empresaB).expect(200);

    expect(configA.body.data.activo).toBe(true);
    expect(configB.body.data.activo).toBe(false);
    expect(configB.body.data.tieneCertificado).toBe(false);
  });
});

describe('Emisión de comprobantes electrónicos', () => {
  it('no se puede emitir sin activar antes la facturación electrónica', async () => {
    const { sesion, catalogos, productoId } = await empresaConProducto();
    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);

    await api.post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion).expect(409);
  });

  it('un envío aceptado por el OSE marca el comprobante como aceptado', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    mockearRespuestaOse({
      codigoRespuesta: '0',
      mensaje: 'La Boleta ha sido aceptada',
      cdrXml: '<ApplicationResponse>CDR DE PRUEBA</ApplicationResponse>',
    });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);

    const comprobante = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);

    expect(comprobante.body.data.estado).toBe('aceptado');
    expect(comprobante.body.data.codigoRespuesta).toBe('0');
    expect(comprobante.body.data.cdrXml).toContain('CDR DE PRUEBA');
    expect(comprobante.body.data.xmlFirmado).toContain('<ds:SignatureValue>');

    // No se puede volver a emitir un comprobante ya aceptado.
    await api.post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion).expect(409);
  });

  it('un fallo de transporte deja el comprobante en error_envio, reintentable', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();
    const espia = mockearRespuestaOse({
      codigoRespuesta: null,
      mensaje: 'No se pudo conectar con el OSE',
      cdrXml: null,
    });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);

    const primerIntento = await api
      .post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion)
      .expect(200);
    expect(primerIntento.body.data.estado).toBe('error_envio');
    expect(primerIntento.body.data.intentos).toBe(1);

    // Reintentar reusa el mismo XML/hash ya firmados: no se vuelve a construir ni a firmar.
    const xmlOriginal = primerIntento.body.data.xmlFirmado;
    espia.mockResolvedValue({ codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });

    const reintento = await api
      .post(`/api/facturacion/comprobantes/${primerIntento.body.data.id}/reintentar`, sesion)
      .expect(200);
    expect(reintento.body.data.estado).toBe('aceptado');
    expect(reintento.body.data.intentos).toBe(2);
    expect(reintento.body.data.xmlFirmado).toBe(xmlOriginal);
  });

  it('un código 4xxx queda observado, y cualquier otro código queda rechazado', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada();

    mockearRespuestaOse({
      codigoRespuesta: '4000',
      mensaje: 'Aceptado con observaciones',
      cdrXml: '<ok/>',
    });
    const ventaObservada = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const observado = await api
      .post(`/api/facturacion/ventas/${ventaObservada.body.data.id}/emitir`, sesion)
      .expect(200);
    expect(observado.body.data.estado).toBe('observado');

    vi.restoreAllMocks();
    mockearRespuestaOse({
      codigoRespuesta: '2335',
      mensaje: 'El comprobante ya fue registrado',
      cdrXml: null,
    });
    const ventaRechazada = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const rechazado = await api
      .post(`/api/facturacion/ventas/${ventaRechazada.body.data.id}/emitir`, sesion)
      .expect(200);
    expect(rechazado.body.data.estado).toBe('rechazado');
  });
});
