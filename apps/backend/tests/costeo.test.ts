import { describe, expect, it } from 'vitest';
import { api, catalogos, crearEmpresaDePrueba } from './ayudantes';

/**
 * El costeo tiene una trampa fácil de reintroducir: `existencias.costo_unitario` guarda el
 * monto **tal como se tipeó en la compra**, que normalmente trae el IGV incluido. Compararlo
 * contra un valor de venta sin IGV infla el costo ~18% y subestima el margen — el número con
 * el que se fijan precios.
 */
describe('Costeo y márgenes', () => {
  it('un platillo sin receta se reporta como tal, no como margen del 100%', async () => {
    const sesion = await crearEmpresaDePrueba();
    const cat = await catalogos(sesion);
    const categoria = await api.post('/api/categorias', sesion, { nombre: 'FONDOS' }).expect(201);

    await api
      .post('/api/productos', sesion, {
        categoriaId: categoria.body.data.id,
        unidadMedidaId: cat.unidadMedidaId,
        tipoAfectacionIgvId: cat.gravadoId,
        nombre: 'SIN RECETA',
        precio: 30,
        tipo: 'servicio',
      })
      .expect(201);

    const costeo = await api.get('/api/costeo', sesion).expect(200);
    const producto = costeo.body.data.productos.find(
      (p: { nombre: string }) => p.nombre === 'SIN RECETA',
    );

    // Informar "margen 100%" sería una mentira más peligrosa que un hueco visible.
    expect(producto.motivoSinCosteo).toBe('sin_receta');
    expect(producto.costo).toBeNull();
    expect(producto.margen).toBeNull();
  });

  it('descuenta el IGV del precio de carta para calcular el margen', async () => {
    const sesion = await crearEmpresaDePrueba();
    const cat = await catalogos(sesion);
    const almacenes = await api.get('/api/almacenes', sesion).expect(200);

    const insumo = await api
      .post('/api/insumos', sesion, {
        nombre: 'POLLO',
        unidadMedidaId: cat.unidadMedidaId,
        tipoAfectacionIgvId: cat.gravadoId,
      })
      .expect(201);

    await api
      .post('/api/existencias/movimientos', sesion, {
        almacenId: almacenes.body.data[0].id,
        insumoId: insumo.body.data.id,
        tipo: 'inicial',
        cantidad: 20,
        costoUnitario: 10,
      })
      .expect(201);

    const categoria = await api.post('/api/categorias', sesion, { nombre: 'FONDOS' }).expect(201);
    await api
      .post('/api/productos', sesion, {
        categoriaId: categoria.body.data.id,
        unidadMedidaId: cat.unidadMedidaId,
        tipoAfectacionIgvId: cat.gravadoId,
        nombre: 'POLLO A LA BRASA',
        precio: 118,
        tipo: 'servicio',
        receta: [{ insumoId: insumo.body.data.id, cantidad: 2 }],
      })
      .expect(201);

    const costeo = await api.get('/api/costeo', sesion).expect(200);
    const plato = costeo.body.data.productos.find(
      (p: { nombre: string }) => p.nombre === 'POLLO A LA BRASA',
    );

    // Precio 118 con IGV => valor de venta 100. Costo: 2 unidades × 10 = 20.
    expect(Number(plato.valorVenta)).toBeCloseTo(100, 2);
    expect(Number(plato.costo)).toBeCloseTo(20, 2);
    expect(Number(plato.margen)).toBeCloseTo(80, 2);
    expect(Number(plato.costoPorcentaje)).toBeCloseTo(20, 1);
    // El costo vino de un movimiento tipeado a mano, sin comprobante que desglose el IGV.
    expect(plato.origenCosto).toBe('manual');
  });

  it('marca el costeo como incompleto si a un insumo le falta costo', async () => {
    const sesion = await crearEmpresaDePrueba();
    const cat = await catalogos(sesion);

    const conCosto = await api
      .post('/api/insumos', sesion, {
        nombre: 'ARROZ',
        unidadMedidaId: cat.unidadMedidaId,
        tipoAfectacionIgvId: cat.gravadoId,
      })
      .expect(201);
    const sinCosto = await api
      .post('/api/insumos', sesion, {
        nombre: 'CULANTRO',
        unidadMedidaId: cat.unidadMedidaId,
        tipoAfectacionIgvId: cat.gravadoId,
      })
      .expect(201);

    const almacenes = await api.get('/api/almacenes', sesion).expect(200);
    await api
      .post('/api/existencias/movimientos', sesion, {
        almacenId: almacenes.body.data[0].id,
        insumoId: conCosto.body.data.id,
        tipo: 'inicial',
        cantidad: 10,
        costoUnitario: 5,
      })
      .expect(201);

    const categoria = await api.post('/api/categorias', sesion, { nombre: 'FONDOS' }).expect(201);
    await api
      .post('/api/productos', sesion, {
        categoriaId: categoria.body.data.id,
        unidadMedidaId: cat.unidadMedidaId,
        tipoAfectacionIgvId: cat.gravadoId,
        nombre: 'ARROZ VERDE',
        precio: 59,
        tipo: 'servicio',
        receta: [
          { insumoId: conCosto.body.data.id, cantidad: 1 },
          { insumoId: sinCosto.body.data.id, cantidad: 0.1 },
        ],
      })
      .expect(201);

    const costeo = await api.get('/api/costeo', sesion).expect(200);
    const plato = costeo.body.data.productos.find(
      (p: { nombre: string }) => p.nombre === 'ARROZ VERDE',
    );

    // El costo mostrado es un piso, no el real: decirlo evita que alguien fije precio sobre
    // un margen que en realidad es menor.
    expect(plato.costoCompleto).toBe(false);
    expect(plato.componentesSinCosto).toContain('CULANTRO');
    expect(Number(plato.costo)).toBeCloseTo(5, 2);
  });
});
