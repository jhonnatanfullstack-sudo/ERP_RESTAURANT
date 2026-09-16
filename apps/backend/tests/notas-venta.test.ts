import { describe, expect, it, vi, afterEach } from 'vitest';
import request from 'supertest';
import forge from 'node-forge';
import { app } from '../src/app';
import { NubefactOseProvider } from '../src/modules/facturacion/ose/nubefact-ose.provider';
import { api, empresaConProducto } from './ayudantes';
import type { RespuestaOse } from '../src/modules/facturacion/ose/ose-provider.interface';
import type { Sesion } from './ayudantes';

/**
 * Notas de Crédito (07) y Débito (08): única forma legal de corregir/complementar una `Venta`
 * cuyo comprobante ya fue aceptado por SUNAT. Igual que `facturacion.test.ts` y
 * `guias-remision.test.ts`, el `NubefactOseProvider` se mockea — nunca se llama a un OSE real.
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

function mockearRespuestaOse(respuesta: RespuestaOse) {
  return vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockResolvedValue(respuesta);
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function catalogosNotas(sesion: Sesion) {
  const traer = async (ruta: string) =>
    (await api.get(`/api/catalogos/${ruta}`, sesion).expect(200)).body.data;
  const [comprobantes, motivosCredito, motivosDebito] = await Promise.all([
    traer('tipos-comprobante'),
    traer('motivos-nota?tipoDocumento=07'),
    traer('motivos-nota?tipoDocumento=08'),
  ]);
  return {
    notaCreditoTipoId: comprobantes.find((t: { codigo: string }) => t.codigo === '07').id,
    notaDebitoTipoId: comprobantes.find((t: { codigo: string }) => t.codigo === '08').id,
    motivoAnulacionId: motivosCredito.find((m: { codigo: string }) => m.codigo === '01').id,
    motivoInteresesId: motivosDebito.find((m: { codigo: string }) => m.codigo === '01').id,
  };
}

/** Deja una empresa con facturación electrónica activa, una venta ya emitida y ACEPTADA por
 * SUNAT, y talonarios de nota de crédito (FC01) y débito (FD01) asignados al admin. */
async function empresaConVentaFacturada(precio = 118) {
  const { sesion, catalogos: cat, productoId } = await empresaConProducto(precio);

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

  const notas = await catalogosNotas(sesion);
  const almacenes = await api.get('/api/almacenes', sesion).expect(200);
  const almacenId = almacenes.body.data[0].id;
  const yo = await api.get('/api/auth/me', sesion).expect(200);

  const talonarioCredito = await api
    .post('/api/talonarios', sesion, {
      empresaId: sesion.empresaId,
      tipoComprobanteId: notas.notaCreditoTipoId,
      almacenId,
      serie: 'FC01',
      numeroInicio: 1,
      numeroFin: 99999999,
      usuarioIds: [yo.body.data.id],
    })
    .expect(201);
  const talonarioDebito = await api
    .post('/api/talonarios', sesion, {
      empresaId: sesion.empresaId,
      tipoComprobanteId: notas.notaDebitoTipoId,
      almacenId,
      serie: 'FD01',
      numeroInicio: 1,
      numeroFin: 99999999,
      usuarioIds: [yo.body.data.id],
    })
    .expect(201);

  mockearRespuestaOse({
    codigoRespuesta: '0',
    mensaje: 'Aceptado',
    cdrXml: '<ApplicationResponse>CDR</ApplicationResponse>',
  });
  const venta = await api
    .post('/api/ventas', sesion, {
      detalles: [{ productoId, cantidad: 1 }],
      tipoComprobanteId: cat.boletaId,
      formaPago: 'contado',
      medioPagoId: cat.efectivoId,
    })
    .expect(201);
  await api.post(`/api/facturacion/ventas/${venta.body.data.id}/emitir`, sesion).expect(200);
  vi.restoreAllMocks();

  return {
    sesion,
    ventaId: venta.body.data.id as string,
    talonarioCreditoId: talonarioCredito.body.data.id as string,
    talonarioDebitoId: talonarioDebito.body.data.id as string,
    motivoAnulacionId: notas.motivoAnulacionId as string,
    motivoInteresesId: notas.motivoInteresesId as string,
  };
}

describe('Notas de Crédito', () => {
  it('no deja registrar una nota sobre una venta sin comprobante aceptado', async () => {
    const { sesion, catalogos: cat, productoId } = await empresaConProducto();
    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: cat.boletaId,
        formaPago: 'contado',
        medioPagoId: cat.efectivoId,
      })
      .expect(201);

    // Sin talonario de nota tampoco existe, pero el primer rechazo debe ser por la venta.
    await api
      .post('/api/notas-venta/credito', sesion, {
        ventaId: venta.body.data.id,
        talonarioId: '00000000-0000-0000-0000-000000000000',
        motivoId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(409);
  });

  it('anula la venta al registrarse y clona sus líneas con los mismos montos', async () => {
    const { sesion, ventaId, talonarioCreditoId, motivoAnulacionId } =
      await empresaConVentaFacturada(118);

    const nota = await api
      .post('/api/notas-venta/credito', sesion, {
        ventaId,
        talonarioId: talonarioCreditoId,
        motivoId: motivoAnulacionId,
        descripcionSustento: 'Se anuló por error de digitación',
      })
      .expect(201);

    expect(nota.body.data.serie).toBe('FC01');
    expect(nota.body.data.numero).toBe(1);
    expect(nota.body.data.total).toBe(118);
    expect(nota.body.data.detalles).toHaveLength(1);
    expect(nota.body.data.estado).toBe('pendiente');

    const venta = await api.get(`/api/ventas/${ventaId}`, sesion).expect(200);
    expect(venta.body.data.estado).toBe('anulada');

    // La venta ya anulada no admite una segunda nota de crédito total.
    await api
      .post('/api/notas-venta/credito', sesion, {
        ventaId,
        talonarioId: talonarioCreditoId,
        motivoId: motivoAnulacionId,
      })
      .expect(409);
  });

  it('bloquea anular directamente una venta con comprobante aceptado, y pide una nota', async () => {
    const { sesion, ventaId } = await empresaConVentaFacturada();

    await api.delete(`/api/ventas/${ventaId}`, sesion).expect(409);
  });

  it('emite la nota y numera un segundo correlativo en otra venta', async () => {
    const { sesion, ventaId, talonarioCreditoId, motivoAnulacionId } =
      await empresaConVentaFacturada(50);

    mockearRespuestaOse({
      codigoRespuesta: '0',
      mensaje: 'La Nota de Crédito ha sido aceptada',
      cdrXml: '<ApplicationResponse>CDR NC</ApplicationResponse>',
    });

    const nota = await api
      .post('/api/notas-venta/credito', sesion, {
        ventaId,
        talonarioId: talonarioCreditoId,
        motivoId: motivoAnulacionId,
      })
      .expect(201);

    const emitida = await api
      .post(`/api/notas-venta/${nota.body.data.id}/emitir`, sesion)
      .expect(200);
    expect(emitida.body.data.estado).toBe('aceptado');
    expect(emitida.body.data.xmlFirmado).toContain('<CreditNote');
    expect(emitida.body.data.xmlFirmado).toContain('<ds:SignatureValue>');
  });
});

describe('Notas de Débito', () => {
  it('registra un cargo adicional sin tocar el estado de la venta', async () => {
    const { sesion, ventaId, talonarioDebitoId, motivoInteresesId } =
      await empresaConVentaFacturada(100);

    const nota = await api
      .post('/api/notas-venta/debito', sesion, {
        ventaId,
        talonarioId: talonarioDebitoId,
        motivoId: motivoInteresesId,
        concepto: 'Interés por pago fuera de plazo',
        monto: 11.8,
      })
      .expect(201);

    expect(nota.body.data.serie).toBe('FD01');
    expect(nota.body.data.total).toBe(11.8);
    expect(nota.body.data.detalles).toHaveLength(1);
    expect(nota.body.data.detalles[0].descripcionProducto).toBe('Interés por pago fuera de plazo');

    const venta = await api.get(`/api/ventas/${ventaId}`, sesion).expect(200);
    expect(venta.body.data.estado).toBe('emitida');
  });

  it('la emisión arma un DebitNote y no afecta el correlativo de las notas de crédito', async () => {
    const { sesion, ventaId, talonarioDebitoId, motivoInteresesId } =
      await empresaConVentaFacturada(100);

    mockearRespuestaOse({
      codigoRespuesta: '0',
      mensaje: 'La Nota de Débito ha sido aceptada',
      cdrXml: '<ApplicationResponse>CDR ND</ApplicationResponse>',
    });

    const nota = await api
      .post('/api/notas-venta/debito', sesion, {
        ventaId,
        talonarioId: talonarioDebitoId,
        motivoId: motivoInteresesId,
        concepto: 'Penalidad',
        monto: 20,
      })
      .expect(201);
    expect(nota.body.data.numero).toBe(1);

    const emitida = await api
      .post(`/api/notas-venta/${nota.body.data.id}/emitir`, sesion)
      .expect(200);
    expect(emitida.body.data.estado).toBe('aceptado');
    expect(emitida.body.data.xmlFirmado).toContain('<DebitNote');
  });
});

describe('Notas de Crédito/Débito — aislamiento y consulta', () => {
  it('no deja ver ni listar las notas de otra empresa (RLS)', async () => {
    const empresaA = await empresaConVentaFacturada(80);
    const empresaB = await empresaConProducto();

    const nota = await api
      .post('/api/notas-venta/credito', empresaA.sesion, {
        ventaId: empresaA.ventaId,
        talonarioId: empresaA.talonarioCreditoId,
        motivoId: empresaA.motivoAnulacionId,
      })
      .expect(201);

    const listaB = await api.get('/api/notas-venta', empresaB.sesion).expect(200);
    expect(listaB.body.data.some((n: { id: string }) => n.id === nota.body.data.id)).toBe(false);

    await api.get(`/api/notas-venta/${nota.body.data.id}`, empresaB.sesion).expect(404);
  });

  it('lista las notas asociadas a una venta específica', async () => {
    const { sesion, ventaId, talonarioCreditoId, motivoAnulacionId } =
      await empresaConVentaFacturada(60);

    await api
      .post('/api/notas-venta/credito', sesion, {
        ventaId,
        talonarioId: talonarioCreditoId,
        motivoId: motivoAnulacionId,
      })
      .expect(201);

    const deVenta = await api.get(`/api/notas-venta/de-venta/${ventaId}`, sesion).expect(200);
    expect(deVenta.body.data).toHaveLength(1);
    expect(deVenta.body.data[0].venta.id).toBe(ventaId);
  });
});
