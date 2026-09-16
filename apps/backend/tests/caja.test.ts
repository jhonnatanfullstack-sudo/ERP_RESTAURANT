import { describe, expect, it } from 'vitest';
import { api, empresaConProducto } from './ayudantes';

/**
 * Caja: apertura, cierre y el arqueo de efectivo. El caso base (venta al contado + propina
 * cuadrando el cierre) ya lo prueba `pagos-digitales.test.ts`; este archivo cubre lo que
 * `caja.service.ts` no contemplaba hasta ahora: un cobro de una deuda pagado en efectivo
 * también es plata física en el cajón, y un egreso no puede dejar el efectivo esperado en
 * negativo.
 */

async function abrirCaja(ctx: Awaited<ReturnType<typeof empresaConProducto>>, montoApertura = 100) {
  const caja = await api.post('/api/cajas/abrir', ctx.sesion, { montoApertura }).expect(201);
  return caja.body.data.id as string;
}

describe('Caja: cobros de crédito en efectivo cuentan en el arqueo', () => {
  it('un cobro de una venta al crédito pagado en efectivo suma al efectivo esperado', async () => {
    const ctx = await empresaConProducto(100);
    await abrirCaja(ctx, 200);

    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'credito',
      })
      .expect(201);

    // El cobro de la deuda, no la venta misma (que es al crédito y no mueve el cajón).
    await api
      .post(`/api/cuentas-por-cobrar/${venta.body.data.id}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 100,
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    const cajaActual = await api.get('/api/cajas/actual', ctx.sesion).expect(200);
    const cierre = await api
      .post(`/api/cajas/${cajaActual.body.data.id}/cerrar`, ctx.sesion, {
        // 200 de apertura + 0 de ventas al contado + 100 del cobro en efectivo = 300.
        montoDeclarado: 300,
      })
      .expect(200);

    expect(cierre.body.data.montoEsperado).toBe(300);
    expect(cierre.body.data.diferencia).toBe(0);
  });

  it('un cobro de deuda pagado por un medio distinto a efectivo no suma al arqueo', async () => {
    const ctx = await empresaConProducto(100);
    await abrirCaja(ctx, 200);

    const medios = await api.get('/api/catalogos/medios-pago', ctx.sesion).expect(200);
    const noEfectivo = medios.body.data.find(
      (m: { codigo: string; requiereBanco: boolean }) =>
        m.codigo !== 'efectivo' && !m.requiereBanco,
    );
    // Todas las cuentas de prueba siembran Yape/Plin (no bancarizados); si por algo no
    // existiera ninguno, no hay nada honesto que probar acá.
    if (!noEfectivo) return;

    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'credito',
      })
      .expect(201);

    await api
      .post(`/api/cuentas-por-cobrar/${venta.body.data.id}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 100,
        medioPagoId: noEfectivo.id,
      })
      .expect(201);

    const cajaActual = await api.get('/api/cajas/actual', ctx.sesion).expect(200);
    const cierre = await api
      .post(`/api/cajas/${cajaActual.body.data.id}/cerrar`, ctx.sesion, { montoDeclarado: 200 })
      .expect(200);

    // Solo la apertura: el cobro por Yape/Plin no movió el cajón físico.
    expect(cierre.body.data.montoEsperado).toBe(200);
  });

  it('un cobro anulado no cuenta en el arqueo', async () => {
    const ctx = await empresaConProducto(100);
    await abrirCaja(ctx, 200);

    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'credito',
      })
      .expect(201);

    const cobro = await api
      .post(`/api/cuentas-por-cobrar/${venta.body.data.id}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 100,
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);
    const pagoId = cobro.body.data.pagos[0].id;

    await api
      .delete(`/api/pagos-venta/${pagoId}`, ctx.sesion)
      .send({ motivo: 'Registrado por error' })
      .expect(200);

    const cajaActual = await api.get('/api/cajas/actual', ctx.sesion).expect(200);
    const cierre = await api
      .post(`/api/cajas/${cajaActual.body.data.id}/cerrar`, ctx.sesion, { montoDeclarado: 200 })
      .expect(200);

    expect(cierre.body.data.montoEsperado).toBe(200);
  });
});

describe('Caja: un egreso no puede dejar el efectivo esperado en negativo', () => {
  it('rechaza un egreso mayor al efectivo disponible', async () => {
    const ctx = await empresaConProducto(100);
    const cajaId = await abrirCaja(ctx, 50);

    const egreso = await api.post(`/api/cajas/${cajaId}/movimientos`, ctx.sesion, {
      tipo: 'egreso',
      monto: 80,
      concepto: 'Compra de hielo',
    });
    expect(egreso.status).toBe(400);
  });

  it('permite un egreso que no supera el efectivo disponible', async () => {
    const ctx = await empresaConProducto(100);
    const cajaId = await abrirCaja(ctx, 50);

    const egreso = await api
      .post(`/api/cajas/${cajaId}/movimientos`, ctx.sesion, {
        tipo: 'egreso',
        monto: 30,
        concepto: 'Compra de hielo',
      })
      .expect(201);
    expect(egreso.body.data.movimientos).toHaveLength(1);
  });

  it('un ingreso manual amplía lo que después se puede egresar', async () => {
    const ctx = await empresaConProducto(100);
    const cajaId = await abrirCaja(ctx, 50);

    await api
      .post(`/api/cajas/${cajaId}/movimientos`, ctx.sesion, {
        tipo: 'ingreso',
        monto: 100,
        concepto: 'Vuelto devuelto por un proveedor',
      })
      .expect(201);

    // Sin el ingreso (50 de apertura) esto habría sido rechazado.
    const egreso = await api
      .post(`/api/cajas/${cajaId}/movimientos`, ctx.sesion, {
        tipo: 'egreso',
        monto: 120,
        concepto: 'Compra de hielo',
      })
      .expect(201);
    expect(egreso.body.data.movimientos).toHaveLength(2);
  });
});
