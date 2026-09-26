import { describe, expect, it, vi, afterEach } from 'vitest';
import request from 'supertest';
import forge from 'node-forge';
import { app } from '../src/app';
import { NubefactOseProvider } from '../src/modules/facturacion/ose/nubefact-ose.provider';
import { api, empresaConProducto } from './ayudantes';
import type { ResultadoOse } from '../src/modules/facturacion/ose/ose-provider.interface';
import type { Sesion } from './ayudantes';

/**
 * Guía de Remisión Electrónica (FASE de cumplimiento GRE, jul-2026). Igual que
 * `facturacion.test.ts`, el `NubefactOseProvider` se mockea con `vi.spyOn`: nunca se llama a
 * un OSE real. El XML `DespatchAdvice` en sí (`ubl/guia-remision.builder.ts`) todavía no se
 * validó contra el ambiente Beta de un OSE real — ver la nota en ese archivo.
 */

function crearPfxDePrueba(contrasena: string): Buffer {
  const par = forge.pki.rsa.generateKeyPair(1024);
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

function mockearRespuestaOse(resultado: ResultadoOse) {
  return vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockResolvedValue(resultado);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Catálogos propios de este módulo que `catalogos()` (ayudantes.ts) no trae. */
async function catalogosGuiaRemision(sesion: Sesion) {
  const traer = async (ruta: string) =>
    (await api.get(`/api/catalogos/${ruta}`, sesion).expect(200)).body.data;
  const [comprobantes, motivos, modalidades] = await Promise.all([
    traer('tipos-comprobante'),
    traer('motivos-traslado'),
    traer('modalidades-traslado'),
  ]);
  return {
    guiaRemisionTipoId: comprobantes.find((t: { codigo: string }) => t.codigo === '09').id,
    motivoTrasladoEntreEstablecimientosId: motivos.find(
      (m: { codigo: string }) => m.codigo === '04',
    ).id,
    modalidadPrivadaId: modalidades.find((m: { codigo: string }) => m.codigo === '02').id,
    modalidadPublicaId: modalidades.find((m: { codigo: string }) => m.codigo === '01').id,
  };
}

/** Deja una empresa con un talonario de guía de remisión (serie T001) asignado al usuario
 * admin que crea las pruebas, listo para registrar guías. */
async function empresaConTalonarioDeGuiaRemision() {
  const { sesion, catalogos: cat } = await empresaConProducto();
  const guia = await catalogosGuiaRemision(sesion);

  const almacenes = await api.get('/api/almacenes', sesion).expect(200);
  const almacenId = almacenes.body.data[0].id;

  const yo = await api.get('/api/auth/me', sesion).expect(200);

  await api
    .post('/api/talonarios', sesion, {
      empresaId: sesion.empresaId,
      tipoComprobanteId: guia.guiaRemisionTipoId,
      almacenId,
      serie: 'T001',
      numeroInicio: 1,
      numeroFin: 99999999,
      usuarioIds: [yo.body.data.id],
    })
    .expect(201);

  return { sesion, catalogos: cat, guia, almacenId };
}

function payloadGuia(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    motivoTrasladoId: overrides.motivoTrasladoId,
    modalidadTrasladoId: overrides.modalidadTrasladoId,
    fechaTraslado: new Date().toISOString().slice(0, 10),
    pesoTotalKg: 12.5,
    partidaDireccion: 'Av. Principal 123, Almacén central',
    llegadaDireccion: 'Jr. Los Pinos 456, Local 2',
    transportistaPlaca: 'ABC-123',
    transportistaLicencia: 'Q12345678',
    detalles: [{ descripcion: 'Papa blanca', cantidad: 20, unidadMedidaId: overrides.unidadMedidaId }],
    ...overrides,
  };
}

describe('Guías de remisión electrónica', () => {
  it('no se puede registrar sin un talonario de guía de remisión asignado', async () => {
    const { sesion, catalogos: cat } = await empresaConProducto();
    const guia = await catalogosGuiaRemision(sesion);

    await api
      .post(
        '/api/guias-remision',
        sesion,
        payloadGuia({
          motivoTrasladoId: guia.motivoTrasladoEntreEstablecimientosId,
          modalidadTrasladoId: guia.modalidadPrivadaId,
          unidadMedidaId: cat.unidadMedidaId,
        }),
      )
      .expect(409);
  });

  it('registra una guía y numera con la serie del talonario', async () => {
    const { sesion, catalogos: cat, guia } = await empresaConTalonarioDeGuiaRemision();

    const respuesta = await api
      .post(
        '/api/guias-remision',
        sesion,
        payloadGuia({
          motivoTrasladoId: guia.motivoTrasladoEntreEstablecimientosId,
          modalidadTrasladoId: guia.modalidadPrivadaId,
          unidadMedidaId: cat.unidadMedidaId,
        }),
      )
      .expect(201);

    expect(respuesta.body.data.serie).toBe('T001');
    expect(respuesta.body.data.numero).toBe(1);
    expect(respuesta.body.data.estado).toBe('pendiente');
    expect(respuesta.body.data.detalles).toHaveLength(1);

    const segunda = await api
      .post(
        '/api/guias-remision',
        sesion,
        payloadGuia({
          motivoTrasladoId: guia.motivoTrasladoEntreEstablecimientosId,
          modalidadTrasladoId: guia.modalidadPrivadaId,
          unidadMedidaId: cat.unidadMedidaId,
        }),
      )
      .expect(201);
    expect(segunda.body.data.numero).toBe(2);
  });

  it('exige placa y licencia cuando el transporte es privado', async () => {
    const { sesion, catalogos: cat, guia } = await empresaConTalonarioDeGuiaRemision();

    await api
      .post('/api/guias-remision', sesion, {
        ...payloadGuia({
          motivoTrasladoId: guia.motivoTrasladoEntreEstablecimientosId,
          modalidadTrasladoId: guia.modalidadPrivadaId,
          unidadMedidaId: cat.unidadMedidaId,
        }),
        transportistaPlaca: undefined,
        transportistaLicencia: undefined,
      })
      .expect(400);
  });

  it('exige RUC y razón social cuando el transporte es público', async () => {
    const { sesion, catalogos: cat, guia } = await empresaConTalonarioDeGuiaRemision();

    await api
      .post('/api/guias-remision', sesion, {
        ...payloadGuia({
          motivoTrasladoId: guia.motivoTrasladoEntreEstablecimientosId,
          modalidadTrasladoId: guia.modalidadPublicaId,
          unidadMedidaId: cat.unidadMedidaId,
        }),
        transportistaPlaca: undefined,
        transportistaLicencia: undefined,
      })
      .expect(400);
  });

  it('un envío aceptado por el OSE marca la guía como aceptada', async () => {
    const { sesion, catalogos: cat, guia } = await empresaConTalonarioDeGuiaRemision();

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

    mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'La Guía de Remisión ha sido aceptada',
      cdrXml: '<ApplicationResponse>CDR DE PRUEBA GUIA</ApplicationResponse>',
    });

    const registrada = await api
      .post(
        '/api/guias-remision',
        sesion,
        payloadGuia({
          motivoTrasladoId: guia.motivoTrasladoEntreEstablecimientosId,
          modalidadTrasladoId: guia.modalidadPrivadaId,
          unidadMedidaId: cat.unidadMedidaId,
        }),
      )
      .expect(201);

    const emitida = await api
      .post(`/api/guias-remision/${registrada.body.data.id}/emitir`, sesion)
      .expect(200);

    expect(emitida.body.data.estado).toBe('aceptado');
    expect(emitida.body.data.codigoRespuesta).toBe('0');
    expect(emitida.body.data.xmlFirmado).toContain('<ds:SignatureValue>');
    expect(emitida.body.data.xmlFirmado).toContain('DespatchAdvice');
  });

  it('las guías de una empresa no se filtran a otra (RLS)', async () => {
    const { sesion: empresaA, catalogos: catA, guia: guiaA } =
      await empresaConTalonarioDeGuiaRemision();
    const { sesion: empresaB } = await empresaConProducto();

    await api
      .post(
        '/api/guias-remision',
        empresaA,
        payloadGuia({
          motivoTrasladoId: guiaA.motivoTrasladoEntreEstablecimientosId,
          modalidadTrasladoId: guiaA.modalidadPrivadaId,
          unidadMedidaId: catA.unidadMedidaId,
        }),
      )
      .expect(201);

    const listaA = await api.get('/api/guias-remision', empresaA).expect(200);
    const listaB = await api.get('/api/guias-remision', empresaB).expect(200);

    expect(listaA.body.data).toHaveLength(1);
    expect(listaB.body.data).toHaveLength(0);
  });
});
