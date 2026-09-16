import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { api, empresaConProducto } from './ayudantes';

/**
 * Autopedido por QR en mesa y delivery/recojo reales desde la carta pública — antes solo
 * existía un enlace de WhatsApp que nunca creaba un `Pedido` (ver `docs/decisiones-tecnicas.md`).
 * Estos son los únicos endpoints de escritura sin sesión además del registro de demos, así que
 * se prueba también que la mesa quede acotada a su propia empresa (RLS) y que el pedido caiga
 * en la cola normal del staff, no que llegue solo a cocina. Se usa `request(app)` directo (no
 * el helper `api`) porque estas rutas no llevan cabecera de sesión.
 */

async function empresaConMesaLista(precio = 30) {
  const { sesion, catalogos, productoId } = await empresaConProducto(precio);

  const empresa = await api.get(`/api/empresas/${sesion.empresaId}`, sesion).expect(200);
  const slug = empresa.body.data.slug as string;

  const salon = await api.post('/api/salones', sesion, { nombre: 'Salón principal' }).expect(201);
  const mesa = await api
    .post('/api/mesas', sesion, { salonId: salon.body.data.id, numero: '5', capacidad: 4 })
    .expect(201);

  return { sesion, catalogos, productoId, slug, mesaId: mesa.body.data.id as string };
}

describe('Carta pública — información de mesa', () => {
  it('devuelve el número y el salón de una mesa activa', async () => {
    const { slug, mesaId } = await empresaConMesaLista();

    const respuesta = await request(app).get(`/api/publico/${slug}/mesas/${mesaId}`).expect(200);
    expect(respuesta.body.data.numero).toBe('5');
    expect(respuesta.body.data.salon).toBe('Salón principal');
  });

  it('una mesa de otra empresa no se ve a través de un slug ajeno (RLS)', async () => {
    const { mesaId } = await empresaConMesaLista();
    const { slug: slugB } = await empresaConMesaLista();

    await request(app).get(`/api/publico/${slugB}/mesas/${mesaId}`).expect(404);
  });
});

describe('Carta pública — autopedido en mesa', () => {
  it('crea un pedido abierto con canal autopedido, visible para el staff', async () => {
    const { sesion, slug, mesaId, productoId } = await empresaConMesaLista(25);

    const respuesta = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({
        canalOrigen: 'autopedido',
        mesaId,
        detalles: [{ productoId, cantidad: 2 }],
      })
      .expect(201);

    expect(respuesta.body.data.estado).toBe('abierto');
    expect(respuesta.body.data.canalOrigen).toBe('autopedido');
    expect(respuesta.body.data.mesa.id).toBe(mesaId);
    expect(respuesta.body.data.detalles).toHaveLength(1);

    // El staff lo ve en su cola normal de pedidos, tal cual uno abierto desde salón.
    const listaStaff = await api.get('/api/pedidos', sesion).expect(200);
    expect(listaStaff.body.data.some((p: { id: string }) => p.id === respuesta.body.data.id)).toBe(
      true,
    );
  });

  it('un segundo autopedido a la misma mesa se une al pedido ya abierto', async () => {
    const { slug, mesaId, productoId } = await empresaConMesaLista(25);

    const primero = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({ canalOrigen: 'autopedido', mesaId, detalles: [{ productoId, cantidad: 1 }] })
      .expect(201);

    const segundo = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({ canalOrigen: 'autopedido', mesaId, detalles: [{ productoId, cantidad: 1 }] })
      .expect(201);

    expect(segundo.body.data.id).toBe(primero.body.data.id);
    expect(segundo.body.data.detalles).toHaveLength(2);
  });

  it('un autopedido sin mesaId es rechazado', async () => {
    const { slug, productoId } = await empresaConMesaLista();

    await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({ canalOrigen: 'autopedido', detalles: [{ productoId, cantidad: 1 }] })
      .expect(400);
  });
});

describe('Carta pública — delivery y recojo', () => {
  it('un delivery completo crea un pedido sin mesa con los datos de entrega', async () => {
    const { sesion, slug, productoId } = await empresaConMesaLista(40);

    const respuesta = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({
        canalOrigen: 'delivery',
        contactoNombre: 'Ana Pérez',
        contactoTelefono: '987654321',
        direccionEntrega: 'Av. Siempre Viva 742',
        detalles: [{ productoId, cantidad: 3 }],
      })
      .expect(201);

    expect(respuesta.body.data.mesa).toBeNull();
    expect(respuesta.body.data.canalOrigen).toBe('delivery');
    expect(respuesta.body.data.direccionEntrega).toBe('Av. Siempre Viva 742');

    const listaStaff = await api.get('/api/pedidos', sesion).expect(200);
    const pedidoStaff = listaStaff.body.data.find(
      (p: { id: string }) => p.id === respuesta.body.data.id,
    );
    expect(pedidoStaff.contactoTelefono).toBe('987654321');
  });

  it('un delivery sin dirección de entrega es rechazado', async () => {
    const { slug, productoId } = await empresaConMesaLista();

    await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({
        canalOrigen: 'delivery',
        contactoNombre: 'Ana Pérez',
        contactoTelefono: '987654321',
        detalles: [{ productoId, cantidad: 1 }],
      })
      .expect(400);
  });

  it('un recojo válido no exige dirección', async () => {
    const { slug, productoId } = await empresaConMesaLista(20);

    const respuesta = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({
        canalOrigen: 'recojo',
        contactoNombre: 'Luis',
        contactoTelefono: '912345678',
        detalles: [{ productoId, cantidad: 1 }],
      })
      .expect(201);

    expect(respuesta.body.data.canalOrigen).toBe('recojo');
    expect(respuesta.body.data.direccionEntrega).toBeNull();
  });
});
