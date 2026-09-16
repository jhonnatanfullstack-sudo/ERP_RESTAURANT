import { describe, expect, it } from 'vitest';
import { api, catalogos, empresaConProducto } from './ayudantes';
import type { Sesion } from './ayudantes';

/**
 * Fidelización por puntos: se gana al emitir una venta con cliente identificado, según la tasa
 * configurada en `configuraciones`, y se canjea o ajusta a mano. El saldo nunca se guarda
 * aparte — es la suma de los movimientos (ver `fidelizacion.service.ts`).
 */

async function activarFidelizacion(sesion: Sesion, solesPorPunto = 10, valorCanjePunto = 0.1) {
  await api
    .put('/api/configuracion', sesion, {
      fidelizacionActiva: true,
      solesPorPunto,
      valorCanjePunto,
    })
    .expect(200);
}

async function crearCliente(sesion: Sesion, nombres = 'Ana') {
  const cliente = await api
    .post('/api/clientes', sesion, { nombres, apellidos: 'Torres' })
    .expect(201);
  return cliente.body.data.id as string;
}

async function venderA(sesion: Sesion, productoId: string, clienteId: string) {
  const cat = await catalogos(sesion);
  return api
    .post('/api/ventas', sesion, {
      detalles: [{ productoId, cantidad: 1 }],
      tipoComprobanteId: cat.boletaId,
      formaPago: 'contado',
      medioPagoId: cat.efectivoId,
      clienteId,
    })
    .expect(201);
}

describe('Fidelización — acumulación automática', () => {
  it('no acumula puntos si el programa está apagado', async () => {
    const { sesion, productoId } = await empresaConProducto(100);
    const clienteId = await crearCliente(sesion);

    await venderA(sesion, productoId, clienteId);

    const saldo = await api.get(`/api/fidelizacion/clientes/${clienteId}`, sesion).expect(200);
    expect(saldo.body.data.saldo).toBe(0);
    expect(saldo.body.data.movimientos).toHaveLength(0);
  });

  it('acumula puntos redondeados hacia abajo según soles por punto', async () => {
    const { sesion, productoId } = await empresaConProducto(59);
    await activarFidelizacion(sesion, 10);
    const clienteId = await crearCliente(sesion);

    // Precio incluye IGV: total de la venta es 59 (1 unidad), 59/10 = 5.9 -> 5 puntos.
    await venderA(sesion, productoId, clienteId);

    const saldo = await api.get(`/api/fidelizacion/clientes/${clienteId}`, sesion).expect(200);
    expect(saldo.body.data.saldo).toBe(5);
    expect(saldo.body.data.movimientos).toHaveLength(1);
    expect(saldo.body.data.movimientos[0].tipo).toBe('ganado');
  });

  it('no acumula puntos para el cliente genérico "Clientes Varios"', async () => {
    const { sesion, productoId } = await empresaConProducto(100);
    await activarFidelizacion(sesion, 10);

    // Venta sin clienteId usa el cliente genérico de la empresa.
    const cat = await catalogos(sesion);
    await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: cat.boletaId,
        formaPago: 'contado',
        medioPagoId: cat.efectivoId,
      })
      .expect(201);

    const clientes = await api.get('/api/fidelizacion/clientes', sesion).expect(200);
    expect(clientes.body.data).toHaveLength(0);
  });
});

describe('Fidelización — anular una venta revierte lo ganado', () => {
  it('anular la venta que ganó puntos los descuenta del saldo', async () => {
    const { sesion, productoId } = await empresaConProducto(59);
    await activarFidelizacion(sesion, 10);
    const clienteId = await crearCliente(sesion);

    const venta = await venderA(sesion, productoId, clienteId); // 5 puntos (59/10 redondeado)
    const saldoTrasVenta = await api
      .get(`/api/fidelizacion/clientes/${clienteId}`, sesion)
      .expect(200);
    expect(saldoTrasVenta.body.data.saldo).toBe(5);

    await api.delete(`/api/ventas/${venta.body.data.id}`, sesion).expect(200);

    const saldoTrasAnular = await api
      .get(`/api/fidelizacion/clientes/${clienteId}`, sesion)
      .expect(200);
    expect(saldoTrasAnular.body.data.saldo).toBe(0);
    // Dos movimientos, no uno editado: "ganado" original + "ajuste" de reversa — el kardex
    // nunca reescribe (mismo criterio que existencias).
    expect(saldoTrasAnular.body.data.movimientos).toHaveLength(2);
  });

  it('anular una venta que nunca ganó puntos no genera ningún movimiento', async () => {
    const { sesion, productoId } = await empresaConProducto(59);
    // Fidelización sigue apagada: la venta no acredita nada.
    const clienteId = await crearCliente(sesion);
    const venta = await venderA(sesion, productoId, clienteId);

    await api.delete(`/api/ventas/${venta.body.data.id}`, sesion).expect(200);

    const saldo = await api.get(`/api/fidelizacion/clientes/${clienteId}`, sesion).expect(200);
    expect(saldo.body.data.movimientos).toHaveLength(0);
  });
});

describe('Fidelización — canje y ajuste', () => {
  it('canjea puntos hasta el saldo disponible y no permite pasarse', async () => {
    const { sesion, productoId } = await empresaConProducto(100);
    await activarFidelizacion(sesion, 10);
    const clienteId = await crearCliente(sesion);
    await venderA(sesion, productoId, clienteId); // 10 puntos

    await api
      .post('/api/fidelizacion/canjear', sesion, {
        clienteId,
        puntos: 15,
      })
      .expect(400);

    const canje = await api
      .post('/api/fidelizacion/canjear', sesion, {
        clienteId,
        puntos: 4,
        observacion: 'Descuento en la mesa 3',
      })
      .expect(201);
    expect(canje.body.data.puntos).toBe(-4);

    const saldo = await api.get(`/api/fidelizacion/clientes/${clienteId}`, sesion).expect(200);
    expect(saldo.body.data.saldo).toBe(6);
  });

  it('registra un ajuste manual positivo y negativo', async () => {
    const { sesion } = await empresaConProducto();
    const clienteId = await crearCliente(sesion);

    await api
      .post('/api/fidelizacion/ajustar', sesion, {
        clienteId,
        puntos: 50,
        observacion: 'Puntos de cortesía por cumpleaños',
      })
      .expect(201);

    const saldoTrasCortesia = await api
      .get(`/api/fidelizacion/clientes/${clienteId}`, sesion)
      .expect(200);
    expect(saldoTrasCortesia.body.data.saldo).toBe(50);

    await api
      .post('/api/fidelizacion/ajustar', sesion, {
        clienteId,
        puntos: -20,
        observacion: 'Corrección: se acreditó de más',
      })
      .expect(201);

    const saldoFinal = await api.get(`/api/fidelizacion/clientes/${clienteId}`, sesion).expect(200);
    expect(saldoFinal.body.data.saldo).toBe(30);
    expect(saldoFinal.body.data.movimientos).toHaveLength(2);
  });

  it('rechaza un ajuste negativo mayor al saldo disponible', async () => {
    const { sesion } = await empresaConProducto();
    const clienteId = await crearCliente(sesion);

    await api
      .post('/api/fidelizacion/ajustar', sesion, { clienteId, puntos: -5, observacion: 'x' })
      .expect(400);
  });

  it('lista los clientes con puntos ordenados por saldo', async () => {
    const { sesion, productoId } = await empresaConProducto(100);
    await activarFidelizacion(sesion, 10);
    const clienteA = await crearCliente(sesion, 'Ana');
    const clienteB = await crearCliente(sesion, 'Bruno');
    await venderA(sesion, productoId, clienteA); // 10 puntos
    await venderA(sesion, productoId, clienteB);
    await venderA(sesion, productoId, clienteB); // 20 puntos

    const lista = await api.get('/api/fidelizacion/clientes', sesion).expect(200);
    expect(lista.body.data).toHaveLength(2);
    expect(lista.body.data[0].cliente.id).toBe(clienteB);
    expect(lista.body.data[0].saldo).toBe(20);
  });
});

describe('Fidelización — aislamiento entre empresas', () => {
  it('no deja ver ni canjear puntos de un cliente de otra empresa (RLS)', async () => {
    const empresaA = await empresaConProducto(100);
    await activarFidelizacion(empresaA.sesion, 10);
    const clienteId = await crearCliente(empresaA.sesion);
    await venderA(empresaA.sesion, empresaA.productoId, clienteId);

    const empresaB = await empresaConProducto();
    const listaB = await api.get('/api/fidelizacion/clientes', empresaB.sesion).expect(200);
    expect(listaB.body.data).toHaveLength(0);

    await api
      .post('/api/fidelizacion/ajustar', empresaB.sesion, {
        clienteId,
        puntos: 5,
        observacion: 'intento cruzado',
      })
      .expect(400);
  });
});
