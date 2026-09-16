import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient, type Socket } from 'socket.io-client';
import { app } from '../src/app';
import { initSocket } from '../src/realtime/socket';
import { api, empresaConProducto } from './ayudantes';
import type { AddressInfo } from 'node:net';

/**
 * Cocina en tiempo real: cuando se crea o avanza una comanda, `comanda.service.ts` avisa por
 * WebSocket a las pantallas conectadas de la misma empresa (ver `realtime/socket.ts`), en vez
 * de que cada una tenga que esperar su próximo sondeo. Estas pruebas levantan un servidor HTTP
 * propio —el de `supertest` no expone un puerto real, y Socket.IO necesita uno— para conectar
 * un cliente de socket de verdad.
 */
function levantarServidor(): Promise<{ puerto: number; cerrar: () => Promise<void> }> {
  const httpServer = createServer(app);
  initSocket(httpServer);
  return new Promise((resolve) => {
    httpServer.listen(0, () => {
      const { port } = httpServer.address() as AddressInfo;
      resolve({
        puerto: port,
        cerrar: () => new Promise((r) => httpServer.close(() => r())),
      });
    });
  });
}

function conectar(puerto: number, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${puerto}`, { auth: { token } });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

describe('Cocina en tiempo real (WebSockets)', () => {
  it('rechaza la conexión sin token o con uno inválido', async () => {
    const { puerto, cerrar } = await levantarServidor();
    try {
      await expect(conectar(puerto, 'token-invalido')).rejects.toThrow();
    } finally {
      await cerrar();
    }
  });

  it('avisa por socket cuando se crea una comanda de la misma empresa', async () => {
    const { sesion, productoId } = await empresaConProducto();
    const { puerto, cerrar } = await levantarServidor();

    try {
      const socket = await conectar(puerto, sesion.token);
      try {
        const eventoPromesa = new Promise<{ id: string; estado: string }>((resolve) =>
          socket.once('cocina:comanda-actualizada', resolve),
        );

        const pedido = await api.post('/api/pedidos', sesion, {}).expect(201);
        const detalle = await api
          .post(`/api/pedidos/${pedido.body.data.id}/detalles`, sesion, {
            productoId,
            cantidad: 1,
          })
          .expect(201);
        const comanda = await api
          .post('/api/comandas', sesion, {
            pedidoId: pedido.body.data.id,
            detalleIds: [detalle.body.data.id],
          })
          .expect(201);

        const evento = await eventoPromesa;
        expect(evento.id).toBe(comanda.body.data.id);
        expect(evento.estado).toBe('pendiente');
      } finally {
        socket.disconnect();
      }
    } finally {
      await cerrar();
    }
  });

  it('no manda el evento de una empresa a un socket conectado con el de otra', async () => {
    const empresaA = await empresaConProducto();
    const empresaB = await empresaConProducto();
    const { puerto, cerrar } = await levantarServidor();

    try {
      const socketB = await conectar(puerto, empresaB.sesion.token);
      try {
        let recibioEvento = false;
        socketB.once('cocina:comanda-actualizada', () => {
          recibioEvento = true;
        });

        const pedido = await api.post('/api/pedidos', empresaA.sesion, {}).expect(201);
        const detalle = await api
          .post(`/api/pedidos/${pedido.body.data.id}/detalles`, empresaA.sesion, {
            productoId: empresaA.productoId,
            cantidad: 1,
          })
          .expect(201);
        await api
          .post('/api/comandas', empresaA.sesion, {
            pedidoId: pedido.body.data.id,
            detalleIds: [detalle.body.data.id],
          })
          .expect(201);

        // Da tiempo a que el evento viajara si (incorrectamente) se hubiera mandado.
        await new Promise((r) => setTimeout(r, 300));
        expect(recibioEvento).toBe(false);
      } finally {
        socketB.disconnect();
      }
    } finally {
      await cerrar();
    }
  });
});
