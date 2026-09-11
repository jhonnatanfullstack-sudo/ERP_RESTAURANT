import { describe, expect, it } from 'vitest';
import { api, crearEmpresaDePrueba, sesionAdminInicial } from './ayudantes';

/**
 * El aislamiento entre empresas es la garantía más cara de romper del sistema: un fallo acá
 * no es un error de cálculo, es un restaurante leyendo las ventas de otro.
 *
 * Estas pruebas corren con el rol restringido de la aplicación (ver `setup.ts`), así que
 * verifican las políticas RLS de verdad. Con el rol dueño pasarían siempre, incluso rotas.
 */
describe('Aislamiento entre empresas', () => {
  it('una empresa nueva no ve nada de otra', async () => {
    const a = await crearEmpresaDePrueba('Cevicheria');
    const b = await crearEmpresaDePrueba('Polleria');

    await api.post('/api/categorias', a, { nombre: 'ENTRADAS' }).expect(201);
    await api.post('/api/categorias', a, { nombre: 'FONDOS' }).expect(201);

    const deA = await api.get('/api/categorias', a).expect(200);
    const deB = await api.get('/api/categorias', b).expect(200);

    expect(deA.body.data).toHaveLength(2);
    expect(deB.body.data).toHaveLength(0);
  });

  it('no puede leer un registro ajeno ni pidiéndolo por id', async () => {
    const a = await crearEmpresaDePrueba();
    const b = await crearEmpresaDePrueba();

    const creada = await api.post('/api/categorias', a, { nombre: 'POSTRES' }).expect(201);
    const id = creada.body.data.id;

    await api.get(`/api/categorias/${id}`, a).expect(200);
    // 404 y no 403: para la Empresa B ese registro sencillamente no existe.
    await api.get(`/api/categorias/${id}`, b).expect(404);
  });

  it('no puede modificar ni borrar un registro ajeno', async () => {
    const a = await crearEmpresaDePrueba();
    const b = await crearEmpresaDePrueba();

    const creada = await api.post('/api/categorias', a, { nombre: 'BEBIDAS' }).expect(201);
    const id = creada.body.data.id;

    await api.put(`/api/categorias/${id}`, b, { nombre: 'SECUESTRADA' }).expect(404);
    await api.delete(`/api/categorias/${id}`, b).expect(404);

    const sigueIgual = await api.get(`/api/categorias/${id}`, a).expect(200);
    expect(sigueIgual.body.data.nombre).toBe('BEBIDAS');
  });

  it('dos empresas pueden usar el mismo nombre de categoría', async () => {
    const a = await crearEmpresaDePrueba();
    const b = await crearEmpresaDePrueba();

    // Antes de multi-empresa el nombre era único globalmente: esto habría dado 409 y hacía
    // imposible que dos restaurantes convivieran.
    await api.post('/api/categorias', a, { nombre: 'BEBIDAS' }).expect(201);
    await api.post('/api/categorias', b, { nombre: 'BEBIDAS' }).expect(201);
  });

  it('cada empresa solo ve sus propios usuarios y roles', async () => {
    const a = await crearEmpresaDePrueba();
    const admin = await sesionAdminInicial();

    const usuariosA = await api.get('/api/usuarios', a).expect(200);
    const usuariosAdmin = await api.get('/api/usuarios', admin).expect(200);

    // La empresa recién creada tiene exactamente un usuario: el que la registró.
    expect(usuariosA.body.data).toHaveLength(1);
    expect(
      usuariosAdmin.body.data.some((u: { id: string }) => u.id === usuariosA.body.data[0].id),
    ).toBe(false);
  });

  it('cada empresa abre su caja sin depender de las demás', async () => {
    const a = await crearEmpresaDePrueba();
    const b = await crearEmpresaDePrueba();

    // El índice único de "una sola caja abierta" era global antes de multi-empresa: la
    // segunda empresa no podía abrir caja mientras la primera la tuviera abierta.
    await api.post('/api/cajas/abrir', a, { montoApertura: 100 }).expect(201);
    await api.post('/api/cajas/abrir', b, { montoApertura: 200 }).expect(201);
  });
});
