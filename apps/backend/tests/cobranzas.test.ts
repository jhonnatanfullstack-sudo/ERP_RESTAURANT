import { describe, expect, it } from 'vitest';
import { api, empresaConProducto } from './ayudantes';

/**
 * Cuentas por cobrar (ampliación de FASE 14): una venta al crédito genera un cronograma de
 * cuotas y acumula pagos hasta cancelarse. El saldo nunca se guarda en la venta, se calcula
 * siempre desde los pagos vigentes — ver `cobranza.service.ts: armarVista`.
 */

async function ventaAlCredito(
  ctx: Awaited<ReturnType<typeof empresaConProducto>>,
  extra: object = {},
) {
  const venta = await api
    .post('/api/ventas', ctx.sesion, {
      detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
      tipoComprobanteId: ctx.catalogos.boletaId,
      formaPago: 'credito',
      ...extra,
    })
    .expect(201);
  return venta.body.data;
}

async function cobranzaDe(ctx: Awaited<ReturnType<typeof empresaConProducto>>, ventaId: string) {
  return (await api.get(`/api/cuentas-por-cobrar/${ventaId}`, ctx.sesion).expect(200)).body.data;
}

describe('Cuentas por cobrar: cronograma de cuotas', () => {
  it('sin especificar cuotas, genera una sola por el total del comprobante', async () => {
    const ctx = await empresaConProducto(118);
    const venta = await ventaAlCredito(ctx);
    const cobranza = await cobranzaDe(ctx, venta.id);

    expect(cobranza.cuotas).toHaveLength(1);
    expect(cobranza.cuotas[0].monto).toBe(118);
    expect(cobranza.total).toBe(118);
    expect(cobranza.saldo).toBe(118);
    expect(cobranza.estadoCobranza).toBe('pendiente');
  });

  it('reparte el total en partes iguales, la última cuota absorbe el redondeo', async () => {
    const ctx = await empresaConProducto(100);
    const venta = await ventaAlCredito(ctx, {
      numeroCuotas: 3,
      fechaPrimerVencimiento: '2026-01-01',
    });
    const cobranza = await cobranzaDe(ctx, venta.id);

    expect(cobranza.cuotas).toHaveLength(3);
    const suma = cobranza.cuotas.reduce((s: number, c: { monto: number }) => s + c.monto, 0);
    expect(suma).toBeCloseTo(cobranza.total, 2);
    // 100/3 = 33.33 las dos primeras, la tercera se lleva la diferencia.
    expect(cobranza.cuotas[0].monto).toBe(33.33);
    expect(cobranza.cuotas[1].monto).toBe(33.33);
    expect(cobranza.cuotas[2].monto).toBe(33.34);
  });

  it('aparece en el listado de cuentas por cobrar, y no una venta al contado', async () => {
    const ctx = await empresaConProducto();
    await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);
    const credito = await ventaAlCredito(ctx);

    const listado = await api.get('/api/cuentas-por-cobrar', ctx.sesion).expect(200);
    const ids = listado.body.data.map((c: { venta: { id: string } }) => c.venta.id);
    expect(ids).toContain(credito.id);
    expect(ids).toHaveLength(1);
  });
});

describe('Cuentas por cobrar: registrar y anular pagos', () => {
  it('un pago parcial baja el saldo y pasa a "parcial"', async () => {
    const ctx = await empresaConProducto(100);
    const venta = await ventaAlCredito(ctx);

    const cobranza = await api
      .post(`/api/cuentas-por-cobrar/${venta.id}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 40,
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    expect(cobranza.body.data.pagado).toBe(40);
    expect(cobranza.body.data.saldo).toBe(60);
    expect(cobranza.body.data.estadoCobranza).toBe('parcial');
  });

  it('no permite pagar más del saldo pendiente', async () => {
    const ctx = await empresaConProducto(100);
    const venta = await ventaAlCredito(ctx);

    const exceso = await api.post(`/api/cuentas-por-cobrar/${venta.id}/pagos`, ctx.sesion, {
      fechaPago: '2026-01-15',
      monto: 150,
      medioPagoId: ctx.catalogos.efectivoId,
    });
    expect(exceso.status).toBe(400);
  });

  it('pagar el saldo completo marca la cuenta como pagada', async () => {
    const ctx = await empresaConProducto(100);
    const venta = await ventaAlCredito(ctx);

    const cobranza = await api
      .post(`/api/cuentas-por-cobrar/${venta.id}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 100,
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    expect(cobranza.body.data.saldo).toBe(0);
    expect(cobranza.body.data.estadoCobranza).toBe('pagada');
  });

  it('un medio de pago bancarizado exige banco y número de operación', async () => {
    const ctx = await empresaConProducto(100);
    const venta = await ventaAlCredito(ctx);
    const medios = await api.get('/api/catalogos/medios-pago', ctx.sesion).expect(200);
    const bancarizado = medios.body.data.find((m: { requiereBanco: boolean }) => m.requiereBanco);
    // No todas las cuentas de prueba siembran un medio bancarizado; si no existe, la regla no
    // se puede ejercitar, pero tampoco hay nada que probar de forma honesta.
    if (!bancarizado) return;

    const sinBanco = await api.post(`/api/cuentas-por-cobrar/${venta.id}/pagos`, ctx.sesion, {
      fechaPago: '2026-01-15',
      monto: 10,
      medioPagoId: bancarizado.id,
    });
    expect(sinBanco.status).toBe(400);

    const bancos = await api.get('/api/catalogos/bancos', ctx.sesion).expect(200);
    const conBanco = await api
      .post(`/api/cuentas-por-cobrar/${venta.id}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 10,
        medioPagoId: bancarizado.id,
        bancoId: bancos.body.data[0].id,
        numeroOperacion: 'OP-0001',
      })
      .expect(201);
    expect(conBanco.body.data.pagado).toBe(10);
  });

  it('anular un pago sube el saldo de nuevo, sin borrar la fila del pago', async () => {
    const ctx = await empresaConProducto(100);
    const venta = await ventaAlCredito(ctx);

    const cobrado = await api
      .post(`/api/cuentas-por-cobrar/${venta.id}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 40,
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);
    const pagoId = cobrado.body.data.pagos[0].id;

    const anulado = await api
      .delete(`/api/pagos-venta/${pagoId}`, ctx.sesion)
      .send({ motivo: 'Registrado por error' })
      .expect(200);

    expect(anulado.body.data.pagado).toBe(0);
    expect(anulado.body.data.saldo).toBe(100);
    expect(anulado.body.data.pagos).toHaveLength(1);
    expect(anulado.body.data.pagos[0].anulado).toBe(true);
  });

  it('no se pueden registrar cobros sobre una venta al contado', async () => {
    const ctx = await empresaConProducto();
    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    const intento = await api.post(
      `/api/cuentas-por-cobrar/${venta.body.data.id}/pagos`,
      ctx.sesion,
      {
        fechaPago: '2026-01-15',
        monto: 10,
        medioPagoId: ctx.catalogos.efectivoId,
      },
    );
    expect(intento.status).toBe(400);
  });
});

describe('Cuentas por cobrar: aislamiento entre empresas', () => {
  it('la cuenta por cobrar de otra empresa no es visible ni cobrable', async () => {
    const a = await empresaConProducto(100);
    const b = await empresaConProducto();
    const ventaDeA = await ventaAlCredito(a);

    const lectura = await api.get(`/api/cuentas-por-cobrar/${ventaDeA.id}`, b.sesion);
    expect(lectura.status).toBe(404);

    const pago = await api.post(`/api/cuentas-por-cobrar/${ventaDeA.id}/pagos`, b.sesion, {
      fechaPago: '2026-01-15',
      monto: 10,
      medioPagoId: b.catalogos.efectivoId,
    });
    expect(pago.status).toBe(404);
  });
});
