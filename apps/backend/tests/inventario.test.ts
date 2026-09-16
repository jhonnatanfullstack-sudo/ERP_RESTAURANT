import { describe, expect, it } from 'vitest';
import { api, catalogos, crearEmpresaDePrueba } from './ayudantes';

/**
 * La regla más sutil del sistema: **el stock de un platillo se descuenta cuando cocina
 * entrega la comanda**, no cuando se factura — ese es el momento en que el insumo
 * físicamente se usó. Facturar después solo enlaza ese movimiento a la venta.
 *
 * Es una regla que se decidió con el usuario en FASE 16 y que es fácil de romper sin darse
 * cuenta: cualquiera que "arregle" el descuento moviéndolo a la emisión de la venta haría
 * que el stock se descuente dos veces, y nada lo avisaría hasta el siguiente inventario
 * físico.
 */
async function prepararCocina() {
  const sesion = await crearEmpresaDePrueba();
  const cat = await catalogos(sesion);

  const almacenes = await api.get('/api/almacenes', sesion).expect(200);
  // El registro de una demo crea el almacén principal: sin él, Inventario no puede registrar
  // los movimientos automáticos.
  const almacenId = almacenes.body.data[0].id;

  const insumo = await api
    .post('/api/insumos', sesion, {
      nombre: 'ARROZ',
      unidadMedidaId: cat.unidadMedidaId,
      tipoAfectacionIgvId: cat.gravadoId,
    })
    .expect(201);

  await api
    .post('/api/existencias/movimientos', sesion, {
      almacenId,
      insumoId: insumo.body.data.id,
      tipo: 'inicial',
      cantidad: 10,
      costoUnitario: 4,
    })
    .expect(201);

  const categoria = await api.post('/api/categorias', sesion, { nombre: 'FONDOS' }).expect(201);

  const producto = await api
    .post('/api/productos', sesion, {
      categoriaId: categoria.body.data.id,
      unidadMedidaId: cat.unidadMedidaId,
      tipoAfectacionIgvId: cat.gravadoId,
      nombre: 'ARROZ CHAUFA',
      precio: 20,
      tipo: 'servicio',
      receta: [{ insumoId: insumo.body.data.id, cantidad: 0.25 }],
    })
    .expect(201);

  return {
    sesion,
    catalogos: cat,
    almacenId,
    insumoId: insumo.body.data.id,
    productoId: producto.body.data.id,
  };
}

async function stockDe(ctx: Awaited<ReturnType<typeof prepararCocina>>): Promise<number> {
  const stock = await api.get('/api/existencias/stock', ctx.sesion).expect(200);
  const fila = stock.body.data.find(
    (s: { insumoId: string | null }) => s.insumoId === ctx.insumoId,
  );
  return fila ? Number(fila.stock) : 0;
}

describe('Inventario y kardex', () => {
  it('un movimiento inicial suma stock', async () => {
    const ctx = await prepararCocina();
    expect(await stockDe(ctx)).toBe(10);
  });

  it('un ajuste de salida resta stock', async () => {
    const ctx = await prepararCocina();
    await api
      .post('/api/existencias/movimientos', ctx.sesion, {
        almacenId: ctx.almacenId,
        insumoId: ctx.insumoId,
        tipo: 'ajuste_salida',
        cantidad: 2,
        observacion: 'Merma',
      })
      .expect(201);

    expect(await stockDe(ctx)).toBe(8);
  });

  it('el kardex nunca reescribe: cada movimiento es una fila propia', async () => {
    const ctx = await prepararCocina();
    await api
      .post('/api/existencias/movimientos', ctx.sesion, {
        almacenId: ctx.almacenId,
        insumoId: ctx.insumoId,
        tipo: 'ajuste_salida',
        cantidad: 1,
      })
      .expect(201);

    const movimientos = await api
      .get(`/api/existencias/movimientos?insumoId=${ctx.insumoId}`, ctx.sesion)
      .expect(200);

    expect(movimientos.body.data).toHaveLength(2);
    expect(movimientos.body.data.map((m: { tipo: string }) => m.tipo).sort()).toEqual([
      'ajuste_salida',
      'inicial',
    ]);
  });

  it('una venta directa descuenta los insumos de la receta una sola vez', async () => {
    const ctx = await prepararCocina();

    // Venta directa: la línea nunca pasó por cocina, así que el descuento ocurre al emitir.
    await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 2 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    // 10 − (2 platos × 0.25 kg) = 9.5
    expect(await stockDe(ctx)).toBeCloseTo(9.5, 3);
  });

  it('anular una venta directa devuelve el stock de sus insumos', async () => {
    const ctx = await prepararCocina();

    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        detalles: [{ productoId: ctx.productoId, cantidad: 2 }],
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    // 10 − (2 platos × 0.25 kg) = 9.5
    expect(await stockDe(ctx)).toBeCloseTo(9.5, 3);

    await api.delete(`/api/ventas/${venta.body.data.id}`, ctx.sesion).expect(200);

    // El insumo vuelve al stock original: la venta nunca debió consumirlo.
    expect(await stockDe(ctx)).toBe(10);

    // La reversa es un movimiento propio, no una edición del original — mismo criterio de
    // "el kardex nunca se borra" que ya prueba el caso de compras.
    const movimientos = await api
      .get(`/api/existencias/movimientos?insumoId=${ctx.insumoId}`, ctx.sesion)
      .expect(200);
    expect(movimientos.body.data.map((m: { tipo: string }) => m.tipo).sort()).toEqual([
      'anulacion_venta',
      'inicial',
      'venta_directa',
    ]);
  });

  it('el stock de otra empresa no se ve afectado', async () => {
    const a = await prepararCocina();
    const b = await prepararCocina();

    await api
      .post('/api/existencias/movimientos', a.sesion, {
        almacenId: a.almacenId,
        insumoId: a.insumoId,
        tipo: 'ajuste_salida',
        cantidad: 5,
      })
      .expect(201);

    expect(await stockDe(a)).toBe(5);
    expect(await stockDe(b)).toBe(10);
  });
});
