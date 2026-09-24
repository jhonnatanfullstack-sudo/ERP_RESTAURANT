import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { AppDataSource } from '../src/database/data-source';
import { pedidoPublico } from '../src/modules/pedidos/pedido.mapper';
import { api, empresaConProducto, type Sesion } from './ayudantes';

/**
 * Autopedido por QR en mesa y delivery/recojo reales desde la carta pública — antes solo
 * existía un enlace de WhatsApp que nunca creaba un `Pedido` (ver `docs/decisiones-tecnicas.md`).
 * Estos son los únicos endpoints de escritura sin sesión además del registro de demos, así que
 * se prueba también que la mesa quede acotada a su propia empresa (RLS) y que el pedido caiga
 * en la cola normal del staff, no que llegue solo a cocina. Se usa `request(app)` directo (no
 * el helper `api`) porque estas rutas no llevan cabecera de sesión.
 *
 * H04 (`docs/auditoria/BACKLOG-TECNICO.md`): el mismo endpoint público reutilizaba CUALQUIER
 * pedido abierto de la mesa sin filtrar por canal de origen, así que un tercero sin
 * autenticarse podía agregar líneas al pedido de un mesero y recibir en la respuesta el
 * `cliente` completo asociado (PII real). T03/T04/T10/T11 prueban la corrección: la mesa solo
 * se reutiliza cuando el pedido abierto es del mismo canal (`AUTOPEDIDO`); si hay un pedido
 * abierto de otro canal, se rechaza con `409` sin tocarlo ni exponerlo. T05 prueba el mapper
 * público (`pedidoPublico()`) como frontera de serialización independiente de ese chequeo.
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

/** Abre un pedido de SALON por el flujo real autenticado (el mesero), opcionalmente con un
 * cliente asociado, y le agrega una línea — para tener "detalles existentes" que verificar
 * intactos después del intento de autopedido. Devuelve también el total esperado. */
async function crearPedidoSalonConDetalle(
  sesion: Sesion,
  mesaId: string,
  productoId: string,
  cantidad: number,
  clienteId?: string,
) {
  const pedido = await api.post('/api/pedidos', sesion, { mesaId, clienteId }).expect(201);
  const pedidoId = pedido.body.data.id as string;

  await api
    .post(`/api/pedidos/${pedidoId}/detalles`, sesion, { productoId, cantidad })
    .expect(201);

  const actual = await api.get(`/api/pedidos/${pedidoId}`, sesion).expect(200);
  return {
    pedidoId,
    detallesOriginales: actual.body.data.detalles as unknown[],
    totalOriginal: actual.body.data.total as number,
  };
}

function marcador(etiqueta: string): string {
  return `${etiqueta}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** Igual que `marcador()` pero acotado a columnas cortas (`numeroDocumento`/`telefono`, ambas
 * `varchar(20)`) — sigue siendo único por corrida sin violar el `max(20)` del DTO. */
function marcadorCorto(prefijo: string): string {
  return `${prefijo}${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Inserta un segundo pedido ABIERTO directamente en la base, saltándose el guard de
 * `crearPedido` (que ya impide dos pedidos abiertos de cualquier canal en la misma mesa) —
 * únicamente para construir en la prueba el estado inconsistente que H12 documenta como no
 * garantizado a nivel de base de datos todavía. No es un atajo de producción: es exactamente el
 * mismo patrón de inserción directa con bypass de RLS que ya usa el resto de la suite
 * (`auditoria-secretos.test.ts`, `h01-proveedor-semilla.test.ts`) para simular estados que la
 * aplicación normalmente no deja alcanzar. */
async function insertarPedidoDirecto(
  empresaId: string,
  mesaId: string,
  canalOrigen: 'salon' | 'autopedido',
): Promise<string> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const filas: Array<{ id: string }> = await queryRunner.query(
      `INSERT INTO "pedidos" ("empresa_id", "mesa_id", "estado", "canal_origen")
       VALUES ($1, $2, 'abierto', $3)
       RETURNING "id"`,
      [empresaId, mesaId, canalOrigen],
    );
    await queryRunner.commitTransaction();
    return filas[0].id;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

describe('Carta pública — información de mesa', () => {
  it('devuelve el número y el salón de una mesa activa', async () => {
    const { slug, mesaId } = await empresaConMesaLista();

    const respuesta = await request(app).get(`/api/publico/${slug}/mesas/${mesaId}`).expect(200);
    expect(respuesta.body.data.numero).toBe('5');
    expect(respuesta.body.data.salon).toBe('Salón principal');
  });

  it('T08 — una mesa de otra empresa no se ve a través de un slug ajeno (RLS)', async () => {
    const { mesaId } = await empresaConMesaLista();
    const { slug: slugB } = await empresaConMesaLista();

    await request(app).get(`/api/publico/${slugB}/mesas/${mesaId}`).expect(404);
  });
});

describe('Carta pública — autopedido en mesa', () => {
  it('T01 — crea un pedido abierto con canal autopedido, visible para el staff', async () => {
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

  it('T02 — un segundo autopedido a la misma mesa se une al pedido ya abierto', async () => {
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

  it('T03 — un pedido SALON abierto no puede ser reutilizado ni modificado por un autopedido público', async () => {
    const { sesion, slug, mesaId, productoId } = await empresaConMesaLista(25);

    const { pedidoId, detallesOriginales, totalOriginal } = await crearPedidoSalonConDetalle(
      sesion,
      mesaId,
      productoId,
      2,
    );

    const intento = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({ canalOrigen: 'autopedido', mesaId, detalles: [{ productoId, cantidad: 99 }] });

    expect(intento.status).toBe(409);

    // No solo el status: el pedido de SALON debe seguir exactamente como estaba.
    const trasElIntento = await api.get(`/api/pedidos/${pedidoId}`, sesion).expect(200);
    expect(trasElIntento.body.data.id).toBe(pedidoId);
    expect(trasElIntento.body.data.detalles).toHaveLength(detallesOriginales.length);
    expect(trasElIntento.body.data.detalles).toEqual(detallesOriginales);
    expect(trasElIntento.body.data.total).toBe(totalOriginal);
  });

  it('T04 — un autopedido público no expone al cliente asociado al pedido SALON de la mesa (PII)', async () => {
    const { sesion, slug, mesaId, productoId } = await empresaConMesaLista(25);

    const nombres = marcador('NOMBRE');
    const apellidos = marcador('APELLIDO');
    const numeroDocumento = marcadorCorto('D');
    const telefono = marcadorCorto('T');
    const email = `${marcador('correo')}@ejemplo.test`;
    const direccion = marcador('DIRECCION');

    const tiposDocumento = await api
      .get('/api/catalogos/tipos-documento-identidad', sesion)
      .expect(200);
    const tipoDocumentoIdentidadId = tiposDocumento.body.data[0].id as string;

    const cliente = await api
      .post('/api/clientes', sesion, {
        nombres,
        apellidos,
        tipoDocumentoIdentidadId,
        numeroDocumento,
        telefono,
        email,
        direccion,
      })
      .expect(201);
    const clienteId = cliente.body.data.id as string;

    const { pedidoId } = await crearPedidoSalonConDetalle(
      sesion,
      mesaId,
      productoId,
      1,
      clienteId,
    );

    const intento = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({ canalOrigen: 'autopedido', mesaId, detalles: [{ productoId, cantidad: 1 }] });

    expect(intento.status).toBe(409);

    const cuerpoCompleto = JSON.stringify(intento.body);
    for (const valor of [nombres, apellidos, numeroDocumento, telefono, email, direccion]) {
      expect(cuerpoCompleto).not.toContain(valor);
    }
    expect(cuerpoCompleto).not.toContain(clienteId);
    expect(cuerpoCompleto).not.toContain(pedidoId);
    expect(cuerpoCompleto.toLowerCase()).not.toContain('cliente');
  });

  it('T10 — el 409 de conflicto de canal no filtra ids ni el canal interno', async () => {
    const { sesion, slug, mesaId, productoId } = await empresaConMesaLista(25);

    const { pedidoId } = await crearPedidoSalonConDetalle(sesion, mesaId, productoId, 1);

    const intento = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({ canalOrigen: 'autopedido', mesaId, detalles: [{ productoId, cantidad: 1 }] });

    expect(intento.status).toBe(409);
    expect(intento.body.success).toBe(false);
    expect(typeof intento.body.message).toBe('string');
    expect(intento.body.message).not.toContain(pedidoId);
    expect(intento.body.message).not.toContain(mesaId);
    expect(intento.body.message.toLowerCase()).not.toContain('salon');
    expect(intento.body.message.toLowerCase()).not.toContain('salón');
    expect(intento.body.message.toLowerCase()).not.toContain('cliente');
    expect(intento.body.message.toLowerCase()).not.toContain('mesero');
    // Mismo formato de error que el resto del sistema (`sendError`): success/message/details.
    expect(Array.isArray(intento.body.details)).toBe(true);
  });

  it('T11 — estado inconsistente (AUTOPEDIDO y SALON abiertos a la vez en la misma mesa) también se rechaza', async () => {
    const { sesion, slug, mesaId, productoId } = await empresaConMesaLista(25);

    // Autopedido legítimo primero (mesa sin nada abierto todavía).
    const autopedido = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({ canalOrigen: 'autopedido', mesaId, detalles: [{ productoId, cantidad: 1 }] })
      .expect(201);
    const autopedidoId = autopedido.body.data.id as string;

    // Estado que la aplicación normal NO permite alcanzar (`crearPedido` ya rechaza una segunda
    // mesa con un pedido abierto de cualquier canal) — se inserta directo para probar que H04 es
    // seguro también si H12 (índice único todavía pendiente) llegara a dejarlo pasar por una
    // carrera real.
    const salonId = await insertarPedidoDirecto(sesion.empresaId, mesaId, 'salon');

    const segundoIntento = await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({ canalOrigen: 'autopedido', mesaId, detalles: [{ productoId, cantidad: 1 }] });

    expect(segundoIntento.status).toBe(409);

    // Ninguno de los dos pedidos existentes fue tocado ni fusionado.
    const autopedidoTrasIntento = await api.get(`/api/pedidos/${autopedidoId}`, sesion).expect(200);
    expect(autopedidoTrasIntento.body.data.detalles).toHaveLength(1);

    const salonTrasIntento = await api.get(`/api/pedidos/${salonId}`, sesion).expect(200);
    expect(salonTrasIntento.body.data.detalles).toHaveLength(0);
    expect(salonTrasIntento.body.data.estado).toBe('abierto');
  });

  it('T09 — un autopedido sin mesaId es rechazado', async () => {
    const { slug, productoId } = await empresaConMesaLista();

    await request(app)
      .post(`/api/publico/${slug}/pedidos`)
      .send({ canalOrigen: 'autopedido', detalles: [{ productoId, cantidad: 1 }] })
      .expect(400);
  });
});

describe('Carta pública — delivery y recojo', () => {
  it('T06 — un delivery completo crea un pedido sin mesa con los datos de entrega', async () => {
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

  it('T07 — un recojo válido no exige dirección', async () => {
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

describe('H04 — pedidoPublico() como frontera de serialización', () => {
  it('T05 — nunca expone `cliente`/`clienteId` aunque el objeto de entrada los tenga', () => {
    const nombres = marcador('NOMBRE-MAPPER');
    const numeroDocumento = marcador('DOC-MAPPER');
    const telefono = marcador('TEL-MAPPER');

    // Objeto equivalente a un `Pedido` con `cliente` deliberadamente cargado — el mapper debe
    // ignorarlo igual, no depender de que sea `null`. Se construye a mano (no una entidad real
    // de TypeORM) precisamente para probar el mapper como función pura, sin infraestructura.
    const pedidoConCliente = {
      id: 'pedido-de-prueba',
      estado: 'abierto',
      canalOrigen: 'salon',
      mesa: {
        id: 'mesa-de-prueba',
        numero: '5',
        salon: { nombre: 'Salón principal' },
      },
      cliente: {
        id: 'cliente-de-prueba',
        nombres,
        apellidos: 'Apellido',
        numeroDocumento,
        telefono,
        email: 'correo@ejemplo.test',
        direccion: 'Dirección de prueba',
      },
      detalles: [
        {
          producto: { id: 'producto-de-prueba', nombre: 'Plato de prueba' },
          cantidad: 2,
          precioUnitario: 10,
          subtotal: 20,
          notas: null,
        },
      ],
      total: 20,
      direccionEntrega: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const resultado = pedidoPublico(pedidoConCliente);

    expect(resultado).not.toHaveProperty('cliente');
    expect(resultado).not.toHaveProperty('clienteId');
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain(nombres);
    expect(serializado).not.toContain(numeroDocumento);
    expect(serializado).not.toContain(telefono);
    expect(serializado).not.toContain('cliente-de-prueba');

    // Y sí conserva lo que el contrato público necesita.
    expect(resultado.id).toBe('pedido-de-prueba');
    expect(resultado.mesa).toEqual({ id: 'mesa-de-prueba', numero: '5', salon: 'Salón principal' });
    expect(resultado.detalles).toEqual([
      { productoId: 'producto-de-prueba', cantidad: 2, precioUnitario: 10, subtotal: 20, notas: null },
    ]);
  });
});
