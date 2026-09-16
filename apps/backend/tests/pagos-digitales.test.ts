import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { api, empresaConProducto } from './ayudantes';

/**
 * Propina digital y QR de cobro Yape/Plin: cierran la brecha de pagos digitales locales sin
 * necesitar una afiliación de comercio (credenciales que este sistema no tiene) — la propina es
 * una columna de `Venta` fuera del comprobante, y el QR es la imagen estática que la propia app
 * de Yape/Plin le muestra al restaurante.
 */

describe('Propina en ventas', () => {
  it('la propina no forma parte del subtotal/igv/total del comprobante', async () => {
    const { sesion, catalogos, productoId } = await empresaConProducto(100);

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
        propina: 5,
      })
      .expect(201);

    expect(venta.body.data.propina).toBe(5);
    // Precio 100 incluye IGV (mismo criterio que el resto de la suite): total = 100, sin la
    // propina sumada.
    expect(venta.body.data.total).toBe(100);
  });

  it('sin indicar propina, queda en 0', async () => {
    const { sesion, catalogos, productoId } = await empresaConProducto(50);

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);

    expect(venta.body.data.propina).toBe(0);
  });

  it('la propina cobrada en efectivo entra al efectivo esperado al cerrar caja', async () => {
    const { sesion, catalogos, productoId } = await empresaConProducto(100);

    await api.post('/api/cajas/abrir', sesion, { montoApertura: 200 }).expect(201);

    await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
        propina: 10,
      })
      .expect(201);

    const cajaActual = await api.get('/api/cajas/actual', sesion).expect(200);
    const cierre = await api
      .post(`/api/cajas/${cajaActual.body.data.id}/cerrar`, sesion, {
        // 200 de apertura + 100 de la venta + 10 de propina = 310.
        montoDeclarado: 310,
      })
      .expect(200);

    expect(cierre.body.data.montoEsperado).toBe(310);
    expect(cierre.body.data.diferencia).toBe(0);
  });
});

describe('QR de cobro Yape/Plin', () => {
  it('sin subir nada, ambos QR son null', async () => {
    const { sesion } = await empresaConProducto();
    const config = await api.get('/api/configuracion', sesion).expect(200);
    expect(config.body.data.qrPagoYape).toBeNull();
    expect(config.body.data.qrPagoPlin).toBeNull();
  });

  it('sube el QR de Yape sin afectar el de Plin, y viceversa', async () => {
    const { sesion } = await empresaConProducto();
    const imagenDePrueba = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );

    const conYape = await request(app)
      .post('/api/configuracion/qr-pago/yape')
      .set(sesion.h)
      .attach('qr', imagenDePrueba, 'yape.png')
      .expect(200);
    expect(conYape.body.data.qrPagoYape).toContain('/uploads/qr-pago/');
    expect(conYape.body.data.qrPagoPlin).toBeNull();

    const conPlin = await request(app)
      .post('/api/configuracion/qr-pago/plin')
      .set(sesion.h)
      .attach('qr', imagenDePrueba, 'plin.png')
      .expect(200);
    expect(conPlin.body.data.qrPagoPlin).toContain('/uploads/qr-pago/');
    // El de Yape, subido antes, sigue ahí.
    expect(conPlin.body.data.qrPagoYape).toContain('/uploads/qr-pago/');
  });

  it('rechaza un medio que no sea yape o plin', async () => {
    const { sesion } = await empresaConProducto();
    const imagenDePrueba = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );

    await request(app)
      .post('/api/configuracion/qr-pago/paypal')
      .set(sesion.h)
      .attach('qr', imagenDePrueba, 'qr.png')
      .expect(400);
  });
});
