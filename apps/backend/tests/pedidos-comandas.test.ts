import { describe, expect, it } from 'vitest';
import { api, catalogos, crearEmpresaDePrueba, empresaConProducto } from './ayudantes';

/**
 * Ciclo de vida completo de un Pedido y su relación con Comandas (cocina) — FASE 12/13. Cubre
 * lo que `tests/cocina-tiempo-real.test.ts` no prueba (ese archivo solo verifica que el evento
 * de socket viaje, no las reglas de negocio) ni `tests/inventario.test.ts` (que solo prueba el
 * descuento de stock por venta directa, nunca por el camino real de cocina).
 */

async function prepararConReceta() {
  const sesion = await crearEmpresaDePrueba();
  const cat = await catalogos(sesion);

  const almacenes = await api.get('/api/almacenes', sesion).expect(200);
  const almacenId = almacenes.body.data[0].id;

  const insumo = await api
    .post('/api/insumos', sesion, {
      nombre: 'POLLO',
      unidadMedidaId: cat.unidadMedidaId,
      tipoAfectacionIgvId: cat.gravadoId,
    })
    .expect(201);

  await api
    .post('/api/existencias/movimientos', sesion, {
      almacenId,
      insumoId: insumo.body.data.id,
      tipo: 'inicial',
      cantidad: 20,
      costoUnitario: 8,
    })
    .expect(201);

  const categoria = await api.post('/api/categorias', sesion, { nombre: 'FONDOS' }).expect(201);
  const producto = await api
    .post('/api/productos', sesion, {
      categoriaId: categoria.body.data.id,
      unidadMedidaId: cat.unidadMedidaId,
      tipoAfectacionIgvId: cat.gravadoId,
      nombre: 'AJI DE GALLINA',
      precio: 25,
      tipo: 'servicio',
      receta: [{ insumoId: insumo.body.data.id, cantidad: 0.3 }],
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

async function stockDe(
  sesion: Awaited<ReturnType<typeof prepararConReceta>>['sesion'],
  insumoId: string,
) {
  const stock = await api.get('/api/existencias/stock', sesion).expect(200);
  const fila = stock.body.data.find((s: { insumoId: string | null }) => s.insumoId === insumoId);
  return fila ? Number(fila.stock) : 0;
}

async function crearMesa(sesion: Awaited<ReturnType<typeof empresaConProducto>>['sesion']) {
  const salon = await api.post('/api/salones', sesion, { nombre: 'Principal' }).expect(201);
  const mesa = await api
    .post('/api/mesas', sesion, { salonId: salon.body.data.id, numero: '1', capacidad: 4 })
    .expect(201);
  return mesa.body.data.id as string;
}

describe('Pedidos: ciclo de vida', () => {
  it('no permite dos pedidos abiertos a la vez en la misma mesa', async () => {
    const ctx = await empresaConProducto();
    const mesaId = await crearMesa(ctx.sesion);

    await api.post('/api/pedidos', ctx.sesion, { mesaId }).expect(201);
    const segundo = await api.post('/api/pedidos', ctx.sesion, { mesaId });
    expect(segundo.status).toBe(409);
  });

  it('un pedido para llevar no necesita mesa, y su total se recalcula al agregar productos', async () => {
    const ctx = await empresaConProducto(20);
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    expect(pedido.body.data.mesa).toBeNull();
    expect(pedido.body.data.total).toBe(0);

    await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 3,
      })
      .expect(201);

    const actualizado = await api
      .get(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion)
      .expect(200);
    expect(actualizado.body.data.total).toBe(60);
  });

  it('no se puede cerrar un pedido sin productos', async () => {
    const ctx = await empresaConProducto();
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);

    const cierre = await api.put(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion, {
      estado: 'cerrado',
    });
    expect(cierre.status).toBe(400);
  });

  it('cierra un pedido con productos y lo reabre para corregir el cierre por error', async () => {
    const ctx = await empresaConProducto();
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 1,
      })
      .expect(201);

    const cierre = await api
      .put(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion, { estado: 'cerrado' })
      .expect(200);
    expect(cierre.body.data.estado).toBe('cerrado');

    const reapertura = await api
      .put(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion, { estado: 'abierto' })
      .expect(200);
    expect(reapertura.body.data.estado).toBe('abierto');
    expect(reapertura.body.data.fechaCierre).toBeNull();

    // Reabierto, vuelve a aceptar líneas nuevas — es exactamente el caso que motiva reabrir.
    await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 1,
      })
      .expect(201);
  });

  it('no reabre un pedido que ya tiene una venta registrada', async () => {
    const ctx = await empresaConProducto();
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 1,
      })
      .expect(201);
    await api
      .put(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion, { estado: 'cerrado' })
      .expect(200);
    await api
      .post('/api/ventas', ctx.sesion, {
        pedidoId: pedido.body.data.id,
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    const reapertura = await api.put(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion, {
      estado: 'abierto',
    });
    expect(reapertura.status).toBe(409);
  });

  it('no reabre un pedido si su mesa ya tiene otro pedido abierto mientras tanto', async () => {
    const ctx = await empresaConProducto();
    const mesaId = await crearMesa(ctx.sesion);
    const primero = await api.post('/api/pedidos', ctx.sesion, { mesaId }).expect(201);
    await api
      .post(`/api/pedidos/${primero.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 1,
      })
      .expect(201);
    await api
      .put(`/api/pedidos/${primero.body.data.id}`, ctx.sesion, { estado: 'cerrado' })
      .expect(200);

    // La mesa quedó libre en la vista derivada: alguien más se sentó y abrió un pedido nuevo.
    await api.post('/api/pedidos', ctx.sesion, { mesaId }).expect(201);

    const reapertura = await api.put(`/api/pedidos/${primero.body.data.id}`, ctx.sesion, {
      estado: 'abierto',
    });
    expect(reapertura.status).toBe(409);
  });

  it('una línea enviada a cocina queda bloqueada para editar o eliminar, la otra sigue libre', async () => {
    const ctx = await empresaConProducto();
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    const detalleEnviado = await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 1,
      })
      .expect(201);
    const detalleLibre = await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 2,
      })
      .expect(201);

    await api
      .post('/api/comandas', ctx.sesion, {
        pedidoId: pedido.body.data.id,
        detalleIds: [detalleEnviado.body.data.id],
      })
      .expect(201);

    const editarBloqueado = await api.put(
      `/api/pedidos/${pedido.body.data.id}/detalles/${detalleEnviado.body.data.id}`,
      ctx.sesion,
      { cantidad: 5 },
    );
    expect(editarBloqueado.status).toBe(400);

    const eliminarBloqueado = await api.delete(
      `/api/pedidos/${pedido.body.data.id}/detalles/${detalleEnviado.body.data.id}`,
      ctx.sesion,
    );
    expect(eliminarBloqueado.status).toBe(400);

    await api
      .put(
        `/api/pedidos/${pedido.body.data.id}/detalles/${detalleLibre.body.data.id}`,
        ctx.sesion,
        {
          cantidad: 4,
        },
      )
      .expect(200);
  });

  it('no se puede cerrar ni cancelar un pedido con una comanda activa', async () => {
    const ctx = await empresaConProducto();
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    const detalle = await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 1,
      })
      .expect(201);
    await api
      .post('/api/comandas', ctx.sesion, {
        pedidoId: pedido.body.data.id,
        detalleIds: [detalle.body.data.id],
      })
      .expect(201);

    const cierre = await api.put(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion, {
      estado: 'cerrado',
    });
    expect(cierre.status).toBe(400);

    const cancelacion = await api.delete(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion);
    expect(cancelacion.status).toBe(400);
  });
});

describe('Comandas: máquina de estados', () => {
  async function prepararComandaPendiente() {
    const ctx = await empresaConProducto();
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    const detalle = await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 1,
      })
      .expect(201);
    const comanda = await api
      .post('/api/comandas', ctx.sesion, {
        pedidoId: pedido.body.data.id,
        detalleIds: [detalle.body.data.id],
      })
      .expect(201);
    return {
      ...ctx,
      pedidoId: pedido.body.data.id,
      detalleId: detalle.body.data.id,
      comandaId: comanda.body.data.id,
    };
  }

  it('no permite saltar pasos: pendiente -> listo directo se rechaza', async () => {
    const ctx = await prepararComandaPendiente();
    const salto = await api.put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, { estado: 'listo' });
    expect(salto.status).toBe(400);
  });

  it('avanza un paso a la vez hasta entregado', async () => {
    const ctx = await prepararComandaPendiente();
    await api
      .put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, { estado: 'en_preparacion' })
      .expect(200);
    await api.put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, { estado: 'listo' }).expect(200);
    const entregada = await api
      .put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, { estado: 'entregado' })
      .expect(200);
    expect(entregada.body.data.estado).toBe('entregado');
  });

  it('retrocede un paso para corregir un toque de más, pero no más allá', async () => {
    const ctx = await prepararComandaPendiente();
    await api
      .put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, { estado: 'en_preparacion' })
      .expect(200);

    // Un paso atrás: corrige haber avanzado por error.
    const retroceso = await api.put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, {
      estado: 'pendiente',
    });
    expect(retroceso.status).toBe(200);
    expect(retroceso.body.data.estado).toBe('pendiente');

    // Pero no dos pasos de una: desde "pendiente" no hay un estado anterior al que volver.
    const masAlla = await api.put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, {
      estado: 'entregado',
    });
    expect(masAlla.status).toBe(400);
  });

  it('no se puede retroceder desde "entregado": ahí ya se descontó el insumo', async () => {
    const ctx = await prepararConReceta();
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    const detalle = await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 1,
      })
      .expect(201);
    const comanda = await api
      .post('/api/comandas', ctx.sesion, {
        pedidoId: pedido.body.data.id,
        detalleIds: [detalle.body.data.id],
      })
      .expect(201);
    await api
      .put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, { estado: 'en_preparacion' })
      .expect(200);
    await api
      .put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, { estado: 'listo' })
      .expect(200);
    await api
      .put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, { estado: 'entregado' })
      .expect(200);

    const retroceso = await api.put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, {
      estado: 'listo',
    });
    expect(retroceso.status).toBe(400);
  });

  it('se puede cancelar una comanda que ya empezó a prepararse (antes de estar lista)', async () => {
    const ctx = await prepararComandaPendiente();
    await api
      .put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, { estado: 'en_preparacion' })
      .expect(200);
    const cancelacion = await api.delete(`/api/comandas/${ctx.comandaId}`, ctx.sesion);
    expect(cancelacion.status).toBe(200);
  });

  it('ya no se puede cancelar una comanda que está lista para entregar', async () => {
    const ctx = await prepararComandaPendiente();
    await api
      .put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, { estado: 'en_preparacion' })
      .expect(200);
    await api.put(`/api/comandas/${ctx.comandaId}`, ctx.sesion, { estado: 'listo' }).expect(200);
    const cancelacion = await api.delete(`/api/comandas/${ctx.comandaId}`, ctx.sesion);
    expect(cancelacion.status).toBe(400);
  });

  it('cancelar una comanda pendiente libera su línea para volver a editarla o enviarla', async () => {
    const ctx = await prepararComandaPendiente();
    await api.delete(`/api/comandas/${ctx.comandaId}`, ctx.sesion).expect(200);

    // Antes bloqueada por estar en una comanda; ahora que se canceló, vuelve a ser editable.
    await api
      .put(`/api/pedidos/${ctx.pedidoId}/detalles/${ctx.detalleId}`, ctx.sesion, { cantidad: 9 })
      .expect(200);

    const reenviada = await api
      .post('/api/comandas', ctx.sesion, { pedidoId: ctx.pedidoId, detalleIds: [ctx.detalleId] })
      .expect(201);
    expect(reenviada.body.data.estado).toBe('pendiente');
  });

  it('al entregar la comanda se descuenta el insumo de la receta, y recién ahí se puede cerrar el pedido', async () => {
    const ctx = await prepararConReceta();
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    const detalle = await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 2,
      })
      .expect(201);
    const comanda = await api
      .post('/api/comandas', ctx.sesion, {
        pedidoId: pedido.body.data.id,
        detalleIds: [detalle.body.data.id],
      })
      .expect(201);

    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBe(20);

    await api
      .put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, { estado: 'en_preparacion' })
      .expect(200);
    await api
      .put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, { estado: 'listo' })
      .expect(200);
    // Antes de entregar, el pedido todavía no puede cerrarse (comanda "listo" sigue activa).
    expect(
      (await api.put(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion, { estado: 'cerrado' }))
        .status,
    ).toBe(400);

    await api
      .put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, { estado: 'entregado' })
      .expect(200);

    // 20 − (2 platos × 0.3 kg) = 19.4
    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBeCloseTo(19.4, 3);

    const cierre = await api
      .put(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion, { estado: 'cerrado' })
      .expect(200);
    expect(cierre.body.data.estado).toBe('cerrado');
  });

  it('anular la venta de un pedido entregado NO devuelve el insumo: la comida ya se sirvió', async () => {
    const ctx = await prepararConReceta();
    const pedido = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    const detalle = await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 2,
      })
      .expect(201);
    const comanda = await api
      .post('/api/comandas', ctx.sesion, {
        pedidoId: pedido.body.data.id,
        detalleIds: [detalle.body.data.id],
      })
      .expect(201);
    await api
      .put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, { estado: 'en_preparacion' })
      .expect(200);
    await api
      .put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, { estado: 'listo' })
      .expect(200);
    await api
      .put(`/api/comandas/${comanda.body.data.id}`, ctx.sesion, { estado: 'entregado' })
      .expect(200);

    // El consumo ya ocurrió al entregar, antes de que existiera ningún comprobante.
    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBeCloseTo(19.4, 3);

    await api
      .put(`/api/pedidos/${pedido.body.data.id}`, ctx.sesion, { estado: 'cerrado' })
      .expect(200);
    const venta = await api
      .post('/api/ventas', ctx.sesion, {
        pedidoId: pedido.body.data.id,
        tipoComprobanteId: ctx.catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: ctx.catalogos.efectivoId,
      })
      .expect(201);

    // Facturar un pedido ya entregado no vuelve a descontar (ver 'al entregar la comanda...').
    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBeCloseTo(19.4, 3);

    await api.delete(`/api/ventas/${venta.body.data.id}`, ctx.sesion).expect(200);

    // Anular la venta tampoco lo devuelve: el plato realmente se sirvió, anular la venta
    // corrige un error de cobro, no "deshace" que el cliente se lo comió.
    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBeCloseTo(19.4, 3);
  });

  it('?activas=true deja fuera las entregadas y canceladas, sin filtrarlo pide todo', async () => {
    const ctx = await prepararComandaPendiente();
    // Una segunda comanda que sí llega a entregado.
    const otro = await api.post('/api/pedidos', ctx.sesion, {}).expect(201);
    const detalleOtro = await api
      .post(`/api/pedidos/${otro.body.data.id}/detalles`, ctx.sesion, {
        productoId: ctx.productoId,
        cantidad: 1,
      })
      .expect(201);
    const comandaEntregada = await api
      .post('/api/comandas', ctx.sesion, {
        pedidoId: otro.body.data.id,
        detalleIds: [detalleOtro.body.data.id],
      })
      .expect(201);
    await api
      .put(`/api/comandas/${comandaEntregada.body.data.id}`, ctx.sesion, {
        estado: 'en_preparacion',
      })
      .expect(200);
    await api
      .put(`/api/comandas/${comandaEntregada.body.data.id}`, ctx.sesion, { estado: 'listo' })
      .expect(200);
    await api
      .put(`/api/comandas/${comandaEntregada.body.data.id}`, ctx.sesion, { estado: 'entregado' })
      .expect(200);

    const soloActivas = await api.get('/api/comandas?activas=true', ctx.sesion).expect(200);
    const estados = soloActivas.body.data.map((c: { estado: string }) => c.estado).sort();
    expect(estados).toEqual(['pendiente']); // la comanda de prepararComandaPendiente()

    const todas = await api.get('/api/comandas', ctx.sesion).expect(200);
    expect(todas.body.data.map((c: { estado: string }) => c.estado).sort()).toEqual([
      'entregado',
      'pendiente',
    ]);
  });
});

describe('Pedidos y comandas: aislamiento entre empresas', () => {
  it('un pedido de otra empresa no es visible ni editable', async () => {
    const a = await empresaConProducto();
    const b = await empresaConProducto();
    const pedidoDeA = await api.post('/api/pedidos', a.sesion, {}).expect(201);

    const lectura = await api.get(`/api/pedidos/${pedidoDeA.body.data.id}`, b.sesion);
    expect(lectura.status).toBe(404);

    const escritura = await api.put(`/api/pedidos/${pedidoDeA.body.data.id}`, b.sesion, {
      notas: 'intento ajeno',
    });
    expect(escritura.status).toBe(404);
  });
});
