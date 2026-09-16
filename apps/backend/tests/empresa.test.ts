import { describe, expect, it } from 'vitest';
import { api, empresaConProducto } from './ayudantes';

/**
 * `POST /api/empresas` (alta manual de una empresa, hoy sin ninguna pantalla que lo llame)
 * tenía dos bugs latentes que no se notaban por falta de uso: nunca generaba `slug` (violaba
 * el NOT NULL de la columna) y no corría bajo `conBypassRls`, así que la política RLS de
 * `empresas` rechazaba el INSERT de una fila con un `id` que no es el de la sesión actual. Se
 * corrigen ambos junto con la decisión de que la URL de la carta salga del nombre, no del RUC.
 */
describe('Alta de empresa: genera el slug de su carta pública', () => {
  it('arma el slug desde el nombre comercial, no desde el RUC', async () => {
    const { sesion } = await empresaConProducto();

    const respuesta = await api
      .post('/api/empresas', sesion, {
        ruc: '20555555555',
        razonSocial: 'La Cevichería del Puerto SAC',
        nombreComercial: 'La Cevichería',
      })
      .expect(201);

    expect(respuesta.body.data.slug).toBe('la-cevicheria');
  });

  it('dos empresas con nombres que generan el mismo slug reciben sufijos distintos', async () => {
    const { sesion } = await empresaConProducto();

    const primera = await api
      .post('/api/empresas', sesion, {
        ruc: '20555555556',
        razonSocial: 'Pollería Doña Rosa SAC',
        nombreComercial: 'Pollería Express',
      })
      .expect(201);

    const segunda = await api
      .post('/api/empresas', sesion, {
        ruc: '20555555557',
        razonSocial: 'Pollería Express Norte SAC',
        nombreComercial: 'Pollería Express',
      })
      .expect(201);

    expect(primera.body.data.slug).toBe('polleria-express');
    expect(segunda.body.data.slug).toBe('polleria-express-2');
  });

  it('la carta pública ya se puede consultar con el slug recién generado', async () => {
    const { sesion } = await empresaConProducto();

    const empresa = await api
      .post('/api/empresas', sesion, {
        ruc: '20555555558',
        razonSocial: 'Chifa Feliz SAC',
        nombreComercial: 'Chifa Feliz',
      })
      .expect(201);

    const carta = await api.get(`/api/publico/${empresa.body.data.slug}/empresa`, sesion);
    expect(carta.status).toBe(200);
  });
});
