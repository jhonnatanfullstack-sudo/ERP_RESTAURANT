import { describe, expect, it } from 'vitest';
import { api, catalogos, crearEmpresaDePrueba, empresaConProducto } from './ayudantes';

/**
 * El cálculo del IGV y el correlativo de comprobantes son las dos cosas del sistema con
 * consecuencias legales: un IGV mal desglosado es una declaración incorrecta ante SUNAT, y un
 * correlativo repetido invalida el comprobante.
 */
describe('Ventas: IGV y correlativos', () => {
  it('desglosa el IGV de un precio que ya lo incluye', async () => {
    const { sesion, catalogos: cat, productoId } = await empresaConProducto(118);

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: cat.boletaId,
        formaPago: 'contado',
        medioPagoId: cat.efectivoId,
      })
      .expect(201);

    // 118 con IGV del 18% => 100 de valor de venta + 18 de IGV. El precio de carta siempre
    // incluye el impuesto (convención del sistema), así que se desglosa hacia atrás.
    expect(Number(venta.body.data.total)).toBeCloseTo(118, 2);
    expect(Number(venta.body.data.subtotal)).toBeCloseTo(100, 2);
    expect(Number(venta.body.data.igv)).toBeCloseTo(18, 2);
  });

  it('no cobra IGV sobre un producto exonerado', async () => {
    const admin = await crearEmpresaDePrueba();
    const cat = await catalogos(admin);
    if (!cat.exoneradoId) return; // el catálogo SUNAT siempre lo trae; se protege por si acaso

    const { sesion, catalogos: cat2, productoId } = await empresaConProducto(100, cat.exoneradoId);

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: cat2.boletaId,
        formaPago: 'contado',
        medioPagoId: cat2.efectivoId,
      })
      .expect(201);

    expect(Number(venta.body.data.igv)).toBe(0);
    expect(Number(venta.body.data.subtotal)).toBeCloseTo(100, 2);
  });

  it('numera correlativamente y sin repetir dentro de la empresa', async () => {
    const { sesion, catalogos: cat, productoId } = await empresaConProducto(50);

    const emitir = () =>
      api
        .post('/api/ventas', sesion, {
          detalles: [{ productoId, cantidad: 1 }],
          tipoComprobanteId: cat.boletaId,
          formaPago: 'contado',
          medioPagoId: cat.efectivoId,
        })
        .expect(201);

    const primera = await emitir();
    const segunda = await emitir();
    const tercera = await emitir();

    const numeros = [primera, segunda, tercera].map((r) => Number(r.body.data.numero));
    expect(numeros).toEqual([numeros[0], numeros[0] + 1, numeros[0] + 2]);
    expect(new Set(numeros).size).toBe(3);
  });

  it('dos empresas llevan su propio correlativo en la misma serie', async () => {
    const a = await empresaConProducto(50);
    const b = await empresaConProducto(50);

    const emitir = (e: typeof a) =>
      api
        .post('/api/ventas', e.sesion, {
          detalles: [{ productoId: e.productoId, cantidad: 1 }],
          tipoComprobanteId: e.catalogos.boletaId,
          formaPago: 'contado',
          medioPagoId: e.catalogos.efectivoId,
        })
        .expect(201);

    const deA = await emitir(a);
    const deB = await emitir(b);

    // Antes de multi-empresa el índice único era (comprobante, serie, número): la segunda
    // empresa habría chocado contra la primera al usar ambas la serie B001.
    expect(deA.body.data.serie).toBe(deB.body.data.serie);
    expect(Number(deA.body.data.numero)).toBe(Number(deB.body.data.numero));
  });

  it('una factura exige cliente con RUC', async () => {
    const { sesion, catalogos: cat, productoId } = await empresaConProducto(50);

    // Sin cliente no se puede emitir factura: SUNAT la exige identificada.
    await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: cat.facturaId,
        formaPago: 'contado',
        medioPagoId: cat.efectivoId,
      })
      .expect(400);
  });

  it('anular una venta no la borra ni libera su número', async () => {
    const { sesion, catalogos: cat, productoId } = await empresaConProducto(50);

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: cat.boletaId,
        formaPago: 'contado',
        medioPagoId: cat.efectivoId,
      })
      .expect(201);

    // Anular es un DELETE: el recurso no se borra, cambia de estado (ver `venta.routes.ts`).
    await api.delete(`/api/ventas/${venta.body.data.id}`, sesion).expect(200);

    const anulada = await api.get(`/api/ventas/${venta.body.data.id}`, sesion).expect(200);
    expect(anulada.body.data.estado).toBe('anulada');
    // El número queda consumido: un comprobante anulado sigue existiendo para SUNAT.
    expect(Number(anulada.body.data.numero)).toBe(Number(venta.body.data.numero));
  });
});
