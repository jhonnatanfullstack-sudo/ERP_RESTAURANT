import { describe, expect, it } from 'vitest';
import { api, crearEmpresaDePrueba } from './ayudantes';

/**
 * Prueba de regresión de un fallo real.
 *
 * La bitácora se escribe en `res.on('finish')`, cuando la transacción de la petición ya se
 * confirmó y su conexión volvió al pool. Al pasar el sistema a una transacción por petición,
 * esa escritura empezó a fallar con "Driver not Connected" — y como el middleware se traga el
 * error a propósito (que la auditoría esté caída no puede tumbar una venta), **la bitácora se
 * quedaba vacía sin que nada lo avisara**. Solo se veía como ruido en los registros.
 *
 * Por eso esta prueba comprueba el resultado en la base y no que no haya excepción: el modo
 * de fallo de este módulo es precisamente no dejar rastro.
 */
describe('Auditoría', () => {
  it('registra las escrituras de la empresa', async () => {
    const empresa = await crearEmpresaDePrueba();

    await api.post('/api/categorias', empresa, { nombre: 'AUDITADA' }).expect(201);

    const bitacora = await api.get('/api/auditoria', empresa).expect(200);
    const entradas = bitacora.body.data.registros ?? bitacora.body.data;

    const entrada = entradas.find(
      (r: { modulo: string; metodo: string }) => r.modulo === 'categorias' && r.metodo === 'POST',
    );
    expect(entrada, 'la creación de la categoría debería estar en la bitácora').toBeDefined();
    expect(entrada.estadoHttp).toBe(201);
  });

  it('no deja que una empresa vea la bitácora de otra', async () => {
    const a = await crearEmpresaDePrueba();
    const b = await crearEmpresaDePrueba();

    await api.post('/api/categorias', a, { nombre: 'SOLO DE A' }).expect(201);

    const deB = await api.get('/api/auditoria', b).expect(200);
    const entradas = deB.body.data.registros ?? deB.body.data;
    expect(entradas.some((r: { modulo: string }) => r.modulo === 'categorias')).toBe(false);
  });
});
