import { describe, expect, it } from 'vitest';
import { AppDataSource } from '../src/database/data-source';
import { api, crearEmpresaDePrueba, sesionAdminInicial } from './ayudantes';

/**
 * Vence la prueba de una empresa moviéndole la fecha al pasado, en vez de esperar 15 días.
 *
 * Necesita su propio `queryRunner` con una transacción: el bypass de RLS se fija con
 * `set_config(..., true)`, que es **local a la transacción**, así que con `AppDataSource.query`
 * el ajuste y el `UPDATE` podrían caer en conexiones distintas del pool y el segundo correría
 * sin permiso para tocar la fila. Es la misma restricción que gobierna toda la aplicación.
 */
async function vencerDemo(empresaId: string): Promise<void> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    await queryRunner.query(
      `UPDATE empresas SET demo_expira_en = now() - interval '1 day' WHERE id = $1`,
      [empresaId],
    );
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

describe('Suscripción y cuentas de prueba', () => {
  it('una demo recién creada puede operar y sabe cuántos días le quedan', async () => {
    const empresa = await crearEmpresaDePrueba();

    const estado = await api.get('/api/suscripcion', empresa).expect(200);
    expect(estado.body.data.estado).toBe('demo');
    expect(estado.body.data.puedeEscribir).toBe(true);
    expect(estado.body.data.diasRestantes).toBeGreaterThan(0);

    await api.post('/api/categorias', empresa, { nombre: 'VIGENTE' }).expect(201);
  });

  it('al vencer queda en solo lectura, no bloqueada', async () => {
    const empresa = await crearEmpresaDePrueba();
    await api.post('/api/categorias', empresa, { nombre: 'CARGADA ANTES' }).expect(201);

    await vencerDemo(empresa.empresaId);

    const estado = await api.get('/api/suscripcion', empresa).expect(200);
    expect(estado.body.data.estado).toBe('demo_vencida');
    expect(estado.body.data.puedeEscribir).toBe(false);

    // Conserva el acceso a lo que cargó: es el argumento para que contrate, y bloquearlo
    // del todo solo lograría que perdiera su trabajo.
    const lectura = await api.get('/api/categorias', empresa).expect(200);
    expect(lectura.body.data).toHaveLength(1);

    // 402 (Pago requerido), no 403: "tu prueba terminó" y "no tienes permiso" son cosas
    // distintas para quien lo recibe.
    const escritura = await api.post('/api/categorias', empresa, { nombre: 'NUEVA' }).expect(402);
    expect(escritura.body.message).toMatch(/prueba/i);
  });

  it('el estado de la suscripción sigue disponible con la cuenta vencida', async () => {
    const empresa = await crearEmpresaDePrueba();
    await vencerDemo(empresa.empresaId);

    // Si esta ruta se bloqueara, el usuario vería sus botones fallar sin ninguna explicación
    // ni forma de saber a quién contactar.
    const estado = await api.get('/api/suscripcion', empresa).expect(200);
    expect(estado.body.data.contactoProveedor).toBeDefined();
  });
});

describe('Panel del proveedor', () => {
  it('solo responde al proveedor del sistema', async () => {
    const cualquiera = await crearEmpresaDePrueba();
    // 404 y no 403: a quien no corresponde no se le confirma siquiera que el panel exista.
    await api.get('/api/plataforma/panel', cualquiera).expect(404);

    const proveedor = await sesionAdminInicial();
    await api.get('/api/plataforma/panel', proveedor).expect(200);
  });

  it('lista las empresas con su uso real y permite extender una demo', async () => {
    const empresa = await crearEmpresaDePrueba('Extendible');
    await api.post('/api/categorias', empresa, { nombre: 'ALGO' }).expect(201);
    await vencerDemo(empresa.empresaId);
    await api.post('/api/categorias', empresa, { nombre: 'OTRA' }).expect(402);

    const proveedor = await sesionAdminInicial();
    const panel = await api.get('/api/plataforma/panel', proveedor).expect(200);
    const fila = panel.body.data.empresas.find((e: { id: string }) => e.id === empresa.empresaId);

    expect(fila).toBeDefined();
    expect(fila.estado).toBe('demo_vencida');
    expect(fila.escrituras).toBeGreaterThan(0);

    await api
      .post(`/api/plataforma/empresas/${empresa.empresaId}/acciones`, proveedor, {
        tipo: 'extender_demo',
        dias: 10,
      })
      .expect(200);

    // Tras extender vuelve a poder operar, sin necesidad de iniciar sesión de nuevo.
    await api.post('/api/categorias', empresa, { nombre: 'OTRA' }).expect(201);
  });
});
