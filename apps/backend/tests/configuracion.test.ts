import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { api, crearEmpresaDePrueba } from './ayudantes';

describe('Configuración del restaurante', () => {
  it('devuelve los valores por defecto sin crear la fila', async () => {
    const empresa = await crearEmpresaDePrueba();

    const primera = await api.get('/api/configuracion', empresa).expect(200);
    expect(primera.body.data.duracionReservaMinutos).toBe(90);
    expect(primera.body.data.diasCreditoPorDefecto).toBe(30);
    expect(primera.body.data.horarioAtencion).toBeNull();

    // Leer dos veces no debe tener efectos: una petición GET no crea nada.
    const segunda = await api.get('/api/configuracion', empresa).expect(200);
    expect(segunda.body.data).toEqual(primera.body.data);
  });

  it('guarda y devuelve lo guardado', async () => {
    const empresa = await crearEmpresaDePrueba();

    const guardada = await api
      .put('/api/configuracion', empresa, {
        duracionReservaMinutos: 120,
        diasCreditoPorDefecto: 45,
        horarioAtencion: 'Lun a Sáb de 12:00 a 22:00',
      })
      .expect(200);

    expect(guardada.body.data.duracionReservaMinutos).toBe(120);

    const releida = await api.get('/api/configuracion', empresa).expect(200);
    expect(releida.body.data.diasCreditoPorDefecto).toBe(45);
    expect(releida.body.data.horarioAtencion).toBe('Lun a Sáb de 12:00 a 22:00');
    // Lo que no se envió conserva su valor por defecto.
    expect(releida.body.data.segundosRefrescoCocina).toBe(8);
  });

  it('rechaza un food cost crítico menor que el objetivo', async () => {
    const empresa = await crearEmpresaDePrueba();
    // Sin esta regla el semáforo de Costos se quedaría sin franja ámbar y marcaría en rojo
    // platos que están dentro de lo esperado.
    await api
      .put('/api/configuracion', empresa, { foodCostObjetivo: 60, foodCostCritico: 40 })
      .expect(400);
  });

  it('rechaza un enlace de red social sin protocolo', async () => {
    const empresa = await crearEmpresaDePrueba();
    await api.put('/api/configuracion', empresa, { facebookUrl: 'facebook.com/x' }).expect(400);
    await api
      .put('/api/configuracion', empresa, { facebookUrl: 'https://facebook.com/x' })
      .expect(200);
  });

  it('la carta pública recibe lo público y nada más', async () => {
    const empresa = await crearEmpresaDePrueba('Publicable');
    await api
      .put('/api/configuracion', empresa, {
        horarioAtencion: 'Todos los días de 11:00 a 23:00',
        mensajeBienvenida: 'Cocina de mercado',
        diasCreditoPorDefecto: 60,
        foodCostObjetivo: 25,
      })
      .expect(200);

    const empresas = await api.get('/api/empresas', empresa).expect(200);
    const slug = empresas.body.data[0].slug;

    const publica = await request(app).get(`/api/publico/${slug}/empresa`).expect(200);

    expect(publica.body.data.horarioAtencion).toBe('Todos los días de 11:00 a 23:00');
    expect(publica.body.data.mensajeBienvenida).toBe('Cocina de mercado');
    // Los números con los que el restaurante mide su negocio no son asunto del comensal.
    expect(publica.body.data.diasCreditoPorDefecto).toBeUndefined();
    expect(publica.body.data.foodCostObjetivo).toBeUndefined();
  });

  it('la configuración no se filtra entre empresas', async () => {
    const a = await crearEmpresaDePrueba();
    const b = await crearEmpresaDePrueba();

    await api.put('/api/configuracion', a, { duracionReservaMinutos: 200 }).expect(200);

    const deB = await api.get('/api/configuracion', b).expect(200);
    expect(deB.body.data.duracionReservaMinutos).toBe(90);
  });
});
