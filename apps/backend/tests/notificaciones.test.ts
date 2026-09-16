import { describe, expect, it } from 'vitest';
import { api, catalogos, crearEmpresaDePrueba, empresaConProducto } from './ayudantes';
import type { Sesion } from './ayudantes';

/**
 * Notificaciones del equipo: bandeja compartida por empresa que se llena sola desde otros
 * flujos (comanda lista, pedido nuevo público, reclamo nuevo) — no hay un endpoint para
 * crearlas a mano, así que estas pruebas disparan el flujo real de cada una.
 */

async function empresaConSalonYMesa() {
  const sesion = await crearEmpresaDePrueba();
  const salon = await api.post('/api/salones', sesion, { nombre: 'Salón principal' }).expect(201);
  const mesa = await api
    .post('/api/mesas', sesion, { salonId: salon.body.data.id, numero: '5', capacidad: 4 })
    .expect(201);
  return { sesion, mesaId: mesa.body.data.id as string };
}

describe('Notificaciones — comanda lista', () => {
  it('crea una notificación cuando una comanda pasa a listo', async () => {
    const { sesion, productoId } = await empresaConProducto();

    const pedido = await api.post('/api/pedidos', sesion, {}).expect(201);
    const detalle = await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, sesion, { productoId, cantidad: 1 })
      .expect(201);
    const comanda = await api
      .post('/api/comandas', sesion, {
        pedidoId: pedido.body.data.id,
        detalleIds: [detalle.body.data.id],
      })
      .expect(201);

    await api
      .put(`/api/comandas/${comanda.body.data.id}`, sesion, { estado: 'en_preparacion' })
      .expect(200);
    await api.put(`/api/comandas/${comanda.body.data.id}`, sesion, { estado: 'listo' }).expect(200);

    const lista = await api.get('/api/notificaciones', sesion).expect(200);
    const notificacion = lista.body.data.find(
      (n: { tipo: string; entidadId: string }) =>
        n.tipo === 'comanda_lista' && n.entidadId === comanda.body.data.id,
    );
    expect(notificacion).toBeTruthy();
    expect(notificacion.leida).toBe(false);
    expect(notificacion.mensaje).toContain('Para llevar');
  });
});

describe('Notificaciones — pedido nuevo público', () => {
  it('avisa al crear un autopedido nuevo, pero no al agregar más ítems al mismo', async () => {
    const { sesion, mesaId } = await empresaConSalonYMesa();
    const empresa = await api.get(`/api/empresas/${sesion.empresaId}`, sesion).expect(200);
    const slug = empresa.body.data.slug as string;

    const categoria = await api.post('/api/categorias', sesion, { nombre: 'PLATOS' }).expect(201);
    const cat = await catalogos(sesion);
    const producto = await api
      .post('/api/productos', sesion, {
        categoriaId: categoria.body.data.id,
        unidadMedidaId: cat.unidadMedidaId,
        tipoAfectacionIgvId: cat.gravadoId,
        nombre: 'PLATO DE PRUEBA',
        precio: 20,
      })
      .expect(201);

    await api
      .post(`/api/publico/${slug}/pedidos`, sesion, {
        canalOrigen: 'autopedido',
        mesaId,
        detalles: [{ productoId: producto.body.data.id, cantidad: 1 }],
      })
      .expect(201);

    const trasElPrimero = await api.get('/api/notificaciones', sesion).expect(200);
    const nuevasDeEstaMesa = trasElPrimero.body.data.filter(
      (n: { tipo: string }) => n.tipo === 'pedido_nuevo',
    );
    expect(nuevasDeEstaMesa).toHaveLength(1);

    // Un segundo pedido a la misma mesa (misma sesión de mesa, todavía abierta) no debe
    // generar una segunda notificación: es "pedir algo más", no un pedido nuevo.
    await api
      .post(`/api/publico/${slug}/pedidos`, sesion, {
        canalOrigen: 'autopedido',
        mesaId,
        detalles: [{ productoId: producto.body.data.id, cantidad: 1 }],
      })
      .expect(201);

    const trasElSegundo = await api.get('/api/notificaciones', sesion).expect(200);
    const notificacionesDePedido = trasElSegundo.body.data.filter(
      (n: { tipo: string }) => n.tipo === 'pedido_nuevo',
    );
    expect(notificacionesDePedido).toHaveLength(1);
  });
});

describe('Notificaciones — reclamo nuevo', () => {
  it('avisa al registrarse un reclamo desde la carta pública', async () => {
    const { sesion } = await empresaConProducto();
    const empresa = await api.get(`/api/empresas/${sesion.empresaId}`, sesion).expect(200);
    const slug = empresa.body.data.slug as string;
    const tipos = await api.get('/api/catalogos/tipos-documento-identidad', sesion).expect(200);

    await api
      .post(`/api/publico/${slug}/reclamaciones`, sesion, {
        tipo: 'reclamo',
        consumidorNombres: 'Ana',
        consumidorApellidos: 'Torres',
        tipoDocumentoIdentidadId: tipos.body.data[0].id,
        consumidorNumeroDocumento: '45678912',
        consumidorDomicilio: 'Av. Siempre Viva 123',
        consumidorEmail: 'ana@ejemplo.test',
        descripcionBien: 'Ají de gallina',
        detalle: 'Llegó frío y tuve que esperar demasiado.',
        pedido: 'Devolución del dinero.',
      })
      .expect(201);

    const lista = await api.get('/api/notificaciones', sesion).expect(200);
    const notificacion = lista.body.data.find(
      (n: { tipo: string }) => n.tipo === 'reclamo_nuevo',
    );
    expect(notificacion).toBeTruthy();
    expect(notificacion.mensaje).toBe('Ají de gallina');
  });
});

describe('Notificaciones — marcar leídas y aislamiento', () => {
  async function crearUnaNotificacion(sesion: Sesion, productoId: string) {
    const pedido = await api.post('/api/pedidos', sesion, {}).expect(201);
    const detalle = await api
      .post(`/api/pedidos/${pedido.body.data.id}/detalles`, sesion, { productoId, cantidad: 1 })
      .expect(201);
    const comanda = await api
      .post('/api/comandas', sesion, {
        pedidoId: pedido.body.data.id,
        detalleIds: [detalle.body.data.id],
      })
      .expect(201);
    await api
      .put(`/api/comandas/${comanda.body.data.id}`, sesion, { estado: 'en_preparacion' })
      .expect(200);
    await api.put(`/api/comandas/${comanda.body.data.id}`, sesion, { estado: 'listo' }).expect(200);
  }

  it('cuenta no leídas y permite marcar una y todas como leídas', async () => {
    const { sesion, productoId } = await empresaConProducto();
    await crearUnaNotificacion(sesion, productoId);
    await crearUnaNotificacion(sesion, productoId);

    const conteo = await api.get('/api/notificaciones/no-leidas', sesion).expect(200);
    expect(conteo.body.data.noLeidas).toBeGreaterThanOrEqual(2);

    const lista = await api.get('/api/notificaciones', sesion).expect(200);
    const primera = lista.body.data[0];
    await api.post(`/api/notificaciones/${primera.id}/leer`, sesion).expect(200);

    await api.post('/api/notificaciones/leer-todas', sesion).expect(200);
    const conteoFinal = await api.get('/api/notificaciones/no-leidas', sesion).expect(200);
    expect(conteoFinal.body.data.noLeidas).toBe(0);
  });

  it('no deja ver las notificaciones de otra empresa (RLS)', async () => {
    const empresaA = await empresaConProducto();
    const empresaB = await empresaConProducto();
    await crearUnaNotificacion(empresaA.sesion, empresaA.productoId);

    const listaB = await api.get('/api/notificaciones', empresaB.sesion).expect(200);
    expect(listaB.body.data).toHaveLength(0);
  });
});
