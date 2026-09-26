import { describe, expect, it } from 'vitest';
import { api, empresaConProducto } from './ayudantes';
import { ejecutarEnTransaccionPropia } from '../src/database/tenant-context';
import { ventaRepository } from '../src/modules/ventas/venta.repository';
import { medioPagoRepository } from '../src/modules/catalogos/catalogos.repository';

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

/**
 * H18 — a diferencia de los tests de arriba (que nunca envían `medioPagoId` al crear una venta
 * al crédito), estos tests reproducen exactamente la combinación que el DTO/service no
 * bloquean: `formaPago: 'credito'` CON `medioPagoId` apuntando a "efectivo". Antes de la
 * corrección, `calcularVentasEfectivo` contaba esa venta como efectivo real en el momento de
 * crearla (sin haber entrado ni un sol), y el cobro posterior (`PagoVenta`) se sumaba aparte —
 * doble conteo.
 */
describe('H18 — una venta a crédito con medioPago efectivo no duplica el efectivo del arqueo', () => {
  it('RED-1: sin cobranza, la venta a crédito no aporta nada al efectivo esperado', async () => {
    const ctx = await empresaConProducto(100);
    const cajaId = await abrirCaja(ctx, 200);

    await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'credito',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    const cierre = await api
      .post(`/api/cajas/${cajaId}/cerrar`, ctx.sesion, { montoDeclarado: 200 })
      .expect(200);

    // La venta a crédito no debe aportar nada al efectivo esperado, aunque su medioPago sea
    // "efectivo": el dinero no entró todavía.
    expect(cierre.body.data.montoEsperado).toBe(200);
    expect(cierre.body.data.diferencia).toBe(0);
  });

  it('RED-2: con cobranza total, el efectivo esperado es apertura + cobro real, nunca el doble', async () => {
    const ctx = await empresaConProducto(100);
    const cajaId = await abrirCaja(ctx, 200);

    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'credito',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    await api
      .post(`/api/cuentas-por-cobrar/${venta.body.data.id}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 100,
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    const cierre = await api
      .post(`/api/cajas/${cajaId}/cerrar`, ctx.sesion, { montoDeclarado: 300 })
      .expect(200);

    // 200 apertura + 100 cobro real = 300. NUNCA 200 + 100 (venta fantasma) + 100 (cobro) = 400.
    expect(cierre.body.data.montoEsperado).toBe(300);
    expect(cierre.body.data.diferencia).toBe(0);
  });

  it('RED-3: con cobranza parcial, el efectivo esperado refleja solo lo cobrado y el saldo es correcto', async () => {
    const ctx = await empresaConProducto(100);
    const cajaId = await abrirCaja(ctx, 200);

    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'credito',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    const cobro = await api
      .post(`/api/cuentas-por-cobrar/${venta.body.data.id}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 40,
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    expect(cobro.body.data.saldo).toBe(60);
    expect(cobro.body.data.estadoCobranza).toBe('parcial');

    const cierre = await api
      .post(`/api/cajas/${cajaId}/cerrar`, ctx.sesion, { montoDeclarado: 240 })
      .expect(200);

    // 200 apertura + 40 cobrado = 240. NUNCA 200 + 100 (venta fantasma) + 40 (cobro) = 340.
    expect(cierre.body.data.montoEsperado).toBe(240);
    expect(cierre.body.data.diferencia).toBe(0);
  });
});

/**
 * H18-B.1 — refuerzo pedido por la revisión independiente de Codex (H18-OBS-01): los tests de
 * arriba solo infieren la normalización de `Venta.medioPago` a través del resultado de Caja.
 * Estos dos comprueban, por separado:
 * 1. que `crearVenta()` realmente persiste `medioPago = null` en una venta al crédito (no solo
 *    que Caja "se comporta bien" por casualidad);
 * 2. que la defensa real está en `calcularVentasEfectivo` (`formaPago = CONTADO`), no solo en
 *    la normalización de `resolverMedioPago()` — simulando deliberadamente una fila histórica
 *    con la combinación inconsistente que existía antes del fix (`formaPago=credito` +
 *    `medioPago=efectivo`), imposible de crear hoy vía `crearVenta()`.
 */
describe('H18-B.1 — Venta.medioPago normalizado a null en crédito (revisión Codex)', () => {
  it('H18-OBS-01a: crearVenta() persiste medioPago=null en una venta al crédito, verificado en la fila real', async () => {
    const ctx = await empresaConProducto(100);

    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'credito',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // No se infiere desde Caja: se relee la fila persistida directamente, con `app.empresa_id`
    // real (RLS real, no bypass) — mismo mecanismo que usan los tests de H13-A
    // (`ejecutarEnTransaccionPropia` + repositorio tenant-aware).
    const persistida = await ejecutarEnTransaccionPropia(ctx.sesion.empresaId, () =>
      ventaRepository.findOneOrFail({ where: { id: ventaId }, relations: { medioPago: true } }),
    );

    expect(persistida.formaPago).toBe('credito');
    expect(persistida.medioPago).toBeNull();
  });

  it('H18-OBS-01b: una fila histórica formaPago=credito + medioPago=efectivo (previa al fix) nunca incrementa el efectivo — la defensa real está en calcularVentasEfectivo', async () => {
    const ctx = await empresaConProducto(100);
    const cajaId = await abrirCaja(ctx, 200);

    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 1 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'credito',
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // Simula deliberadamente el estado histórico previo al fix — hoy `crearVenta()` normaliza
    // `medioPago` a `null` en cualquier venta al crédito, así que esta combinación ya no se
    // puede producir por la vía normal. Se fuerza directamente en la fila con el repositorio
    // tenant-aware dentro de `ejecutarEnTransaccionPropia` (app.empresa_id real), nunca con SQL
    // crudo ni bypass de RLS.
    await ejecutarEnTransaccionPropia(ctx.sesion.empresaId, async () => {
      const medioEfectivo = await medioPagoRepository.findOneByOrFail({ codigo: 'efectivo' });
      const ventaPersistida = await ventaRepository.findOneByOrFail({ id: ventaId });
      ventaPersistida.medioPago = medioEfectivo;
      await ventaRepository.save(ventaPersistida);
    });

    // Antes de cualquier cobro: no hay endpoint que exponga el efectivo esperado en vivo sin
    // cerrar la caja, así que se prueba contra el límite real de `registrarMovimiento` (que
    // reusa `calcularEfectivoDisponible`, la misma función que `cerrarCaja` congela). Si la
    // fila histórica todavía contara (el bug de H18), la disponibilidad sería 300 y este egreso
    // de 200.01 se aceptaría; con la defensa `formaPago=CONTADO` en `calcularVentasEfectivo`,
    // la disponibilidad sigue en 200 y debe rechazarse.
    const egresoSobreElLimite = await api.post(`/api/cajas/${cajaId}/movimientos`, ctx.sesion, {
      tipo: 'egreso',
      monto: 200.01,
      concepto: 'Prueba de límite H18-OBS-01b',
    });
    expect(egresoSobreElLimite.status).toBe(400);

    await api
      .post(`/api/cuentas-por-cobrar/${ventaId}/pagos`, ctx.sesion, {
        fechaPago: '2026-01-15',
        monto: 100,
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    const cierre = await api
      .post(`/api/cajas/${cajaId}/cerrar`, ctx.sesion, { montoDeclarado: 300 })
      .expect(200);

    // 200 apertura + 100 cobro real = 300 — la fila histórica nunca contó, ni antes ni después
    // del cobro. Si `calcularVentasEfectivo` no filtrara por `formaPago`, sería 400.
    expect(cierre.body.data.montoEsperado).toBe(300);
    expect(cierre.body.data.diferencia).toBe(0);
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
