import { describe, expect, it } from 'vitest';
import { api, catalogos, crearEmpresaDePrueba } from './ayudantes';

/**
 * Compras (FASE 17): además del CRUD, la parte delicada es que el kardex nunca se borra —
 * anular o editar una compra **reversa** el stock con un movimiento nuevo (`anulacion_compra`)
 * en vez de tocar los movimientos `compra` ya guardados. Ver `compra.service.ts`.
 */

async function prepararProveedorYAlmacen() {
  const sesion = await crearEmpresaDePrueba();
  const cat = await catalogos(sesion);

  const tiposDoc = await api.get('/api/catalogos/tipos-documento-identidad', sesion).expect(200);
  const proveedor = await api
    .post('/api/proveedores', sesion, {
      razonSocial: 'DISTRIBUIDORA DE PRUEBA SAC',
      tipoDocumentoIdentidadId:
        tiposDoc.body.data.find((t: { codigo: string }) => t.codigo === '6')?.id ??
        tiposDoc.body.data[0].id,
      numeroDocumento: '20123456789',
    })
    .expect(201);

  const almacenes = await api.get('/api/almacenes', sesion).expect(200);
  const almacenId = almacenes.body.data[0].id;

  const insumo = await api
    .post('/api/insumos', sesion, {
      nombre: 'HARINA',
      unidadMedidaId: cat.unidadMedidaId,
      tipoAfectacionIgvId: cat.gravadoId,
    })
    .expect(201);

  return {
    sesion,
    catalogos: cat,
    proveedorId: proveedor.body.data.id,
    almacenId,
    insumoId: insumo.body.data.id,
  };
}

async function stockDe(
  sesion: Awaited<ReturnType<typeof prepararProveedorYAlmacen>>['sesion'],
  insumoId: string,
) {
  const stock = await api.get('/api/existencias/stock', sesion).expect(200);
  const fila = stock.body.data.find((s: { insumoId: string | null }) => s.insumoId === insumoId);
  return fila ? Number(fila.stock) : 0;
}

async function ultimoCostoDe(
  sesion: Awaited<ReturnType<typeof prepararProveedorYAlmacen>>['sesion'],
  insumoId: string,
) {
  const insumos = await api.get('/api/insumos', sesion).expect(200);
  const fila = insumos.body.data.find((i: { id: string }) => i.id === insumoId);
  return fila?.ultimoCosto ?? null;
}

describe('Compras: registro y desglose de IGV', () => {
  it('con IGV incluido, desglosa el valor de compra hacia atrás y suma stock', async () => {
    const ctx = await prepararProveedorYAlmacen();
    const compra = await api
      .post('/api/compras', ctx.sesion, {
        proveedorId: ctx.proveedorId,
        almacenId: ctx.almacenId,
        incluyeIgv: true,
        lineas: [{ insumoId: ctx.insumoId, cantidad: 10, costoUnitario: 11.8 }],
      })
      .expect(201);

    // 118 (10 × 11.8) con IGV incluido → 100 de valor de compra + 18 de IGV.
    expect(compra.body.data.subtotal).toBe(100);
    expect(compra.body.data.igv).toBe(18);
    expect(compra.body.data.total).toBe(118);
    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBe(10);
    expect(await ultimoCostoDe(ctx.sesion, ctx.insumoId)).toBe(11.8);
  });

  it('con IGV no incluido, lo agrega hacia adelante', async () => {
    const ctx = await prepararProveedorYAlmacen();
    const compra = await api
      .post('/api/compras', ctx.sesion, {
        proveedorId: ctx.proveedorId,
        almacenId: ctx.almacenId,
        incluyeIgv: false,
        lineas: [{ insumoId: ctx.insumoId, cantidad: 10, costoUnitario: 10 }],
      })
      .expect(201);

    // 100 de valor de compra (sin IGV) + 18% = 118 de total.
    expect(compra.body.data.subtotal).toBe(100);
    expect(compra.body.data.igv).toBe(18);
    expect(compra.body.data.total).toBe(118);
  });

  it('rechaza comprar un producto que no es tipo mercadería', async () => {
    const ctx = await prepararProveedorYAlmacen();
    const categoria = await api
      .post('/api/categorias', ctx.sesion, { nombre: 'PLATOS' })
      .expect(201);
    const servicio = await api
      .post('/api/productos', ctx.sesion, {
        categoriaId: categoria.body.data.id,
        unidadMedidaId: ctx.catalogos.unidadMedidaId,
        tipoAfectacionIgvId: ctx.catalogos.gravadoId,
        nombre: 'PLATO PREPARADO',
        precio: 20,
        tipo: 'servicio',
      })
      .expect(201);

    const compra = await api.post('/api/compras', ctx.sesion, {
      proveedorId: ctx.proveedorId,
      almacenId: ctx.almacenId,
      lineas: [{ productoId: servicio.body.data.id, cantidad: 1, costoUnitario: 10 }],
    });
    expect(compra.status).toBe(400);
  });
});

describe('Compras: anulación y edición reversan el kardex sin borrarlo', () => {
  it('anular una compra resta el stock con un movimiento nuevo, sin borrar el original', async () => {
    const ctx = await prepararProveedorYAlmacen();
    const compra = await api
      .post('/api/compras', ctx.sesion, {
        proveedorId: ctx.proveedorId,
        almacenId: ctx.almacenId,
        lineas: [{ insumoId: ctx.insumoId, cantidad: 10, costoUnitario: 5 }],
      })
      .expect(201);
    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBe(10);

    await api.post(`/api/compras/${compra.body.data.id}/anular`, ctx.sesion).expect(200);
    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBe(0);

    const movimientos = await api
      .get(`/api/existencias/movimientos?insumoId=${ctx.insumoId}`, ctx.sesion)
      .expect(200);
    expect(movimientos.body.data.map((m: { tipo: string }) => m.tipo).sort()).toEqual([
      'anulacion_compra',
      'compra',
    ]);
  });

  it('no se puede anular dos veces ni editar una compra ya anulada', async () => {
    const ctx = await prepararProveedorYAlmacen();
    const compra = await api
      .post('/api/compras', ctx.sesion, {
        proveedorId: ctx.proveedorId,
        almacenId: ctx.almacenId,
        lineas: [{ insumoId: ctx.insumoId, cantidad: 5, costoUnitario: 5 }],
      })
      .expect(201);
    await api.post(`/api/compras/${compra.body.data.id}/anular`, ctx.sesion).expect(200);

    const segundaAnulacion = await api.post(
      `/api/compras/${compra.body.data.id}/anular`,
      ctx.sesion,
    );
    expect(segundaAnulacion.status).toBe(400);

    const edicion = await api.put(`/api/compras/${compra.body.data.id}`, ctx.sesion, {
      proveedorId: ctx.proveedorId,
      almacenId: ctx.almacenId,
      lineas: [{ insumoId: ctx.insumoId, cantidad: 1, costoUnitario: 1 }],
    });
    expect(edicion.status).toBe(400);
  });

  it('editar una compra reversa la cantidad anterior y aplica solo la nueva', async () => {
    const ctx = await prepararProveedorYAlmacen();
    const compra = await api
      .post('/api/compras', ctx.sesion, {
        proveedorId: ctx.proveedorId,
        almacenId: ctx.almacenId,
        lineas: [{ insumoId: ctx.insumoId, cantidad: 10, costoUnitario: 5 }],
      })
      .expect(201);
    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBe(10);

    await api
      .put(`/api/compras/${compra.body.data.id}`, ctx.sesion, {
        proveedorId: ctx.proveedorId,
        almacenId: ctx.almacenId,
        lineas: [{ insumoId: ctx.insumoId, cantidad: 4, costoUnitario: 6 }],
      })
      .expect(200);

    // 10 (original) − 10 (reversa) + 4 (nueva) = 4.
    expect(await stockDe(ctx.sesion, ctx.insumoId)).toBe(4);

    const movimientos = await api
      .get(`/api/existencias/movimientos?insumoId=${ctx.insumoId}`, ctx.sesion)
      .expect(200);
    expect(movimientos.body.data).toHaveLength(3);
  });
});

describe('Compras: aislamiento entre empresas', () => {
  it('una compra de otra empresa no es visible', async () => {
    const a = await prepararProveedorYAlmacen();
    const b = await prepararProveedorYAlmacen();
    const compraDeA = await api
      .post('/api/compras', a.sesion, {
        proveedorId: a.proveedorId,
        almacenId: a.almacenId,
        lineas: [{ insumoId: a.insumoId, cantidad: 1, costoUnitario: 1 }],
      })
      .expect(201);

    const lectura = await api.get(`/api/compras/${compraDeA.body.data.id}`, b.sesion);
    expect(lectura.status).toBe(404);
  });
});
