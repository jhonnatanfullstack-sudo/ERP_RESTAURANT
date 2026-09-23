import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { api, crearEmpresaDePrueba } from './ayudantes';
import type { Sesion } from './ayudantes';

/**
 * Geografía multi-país (FASE 27): catálogo de países/divisiones administrativas, y que
 * `Empresa.ubigeo` se derive del distrito elegido tanto en el registro público como al editar.
 *
 * H01-R06: estas lecturas de catálogo antes usaban `sesionAdminInicial()` como una sesión
 * autenticada "de conveniencia" — cualquier empresa de prueba ordinaria sirve igual, y H01
 * restringe deliberadamente a la cuenta semilla (nunca es proveedor, siempre exige rotar su
 * contraseña antes de cualquier otra operación) para que la restricción siga siendo
 * comprobable en el resto de la suite.
 */

async function paisPeru(sesion: Sesion) {
  const paises = await api.get('/api/catalogos/paises', sesion).expect(200);
  const peru = paises.body.data.find((p: { codigoIso2: string }) => p.codigoIso2 === 'PE');
  expect(peru).toBeDefined();
  return peru as { id: string };
}

async function unDistritoDePeru(sesion: Sesion) {
  const peru = await paisPeru(sesion);

  const departamentos = await api
    .get(`/api/catalogos/divisiones-administrativas?paisId=${peru.id}`, sesion)
    .expect(200);
  expect(departamentos.body.data.length).toBeGreaterThan(20);
  const departamento = departamentos.body.data[0] as { id: string };

  const provincias = await api
    .get(
      `/api/catalogos/divisiones-administrativas?paisId=${peru.id}&padreId=${departamento.id}`,
      sesion,
    )
    .expect(200);
  const provincia = provincias.body.data[0] as { id: string };

  const distritos = await api
    .get(
      `/api/catalogos/divisiones-administrativas?paisId=${peru.id}&padreId=${provincia.id}`,
      sesion,
    )
    .expect(200);
  const distrito = distritos.body.data[0] as { id: string; codigo: string; nombre: string };

  return { peru, departamento, provincia, distrito };
}

describe('Catálogo de geografía', () => {
  it('el catálogo de países incluye Perú y el árbol de divisiones tiene los tres niveles', async () => {
    const empresa = await crearEmpresaDePrueba('GeografiaCatalogo');
    const { departamento, provincia, distrito } = await unDistritoDePeru(empresa);

    expect(departamento.id).toBeDefined();
    expect(provincia.id).toBeDefined();
    expect(distrito.codigo).toMatch(/^\d{6}$/);
  });

  it('los mismos catálogos están disponibles sin sesión para el formulario de registro', async () => {
    const paises = await request(app).get('/api/demo/paises').expect(200);
    const peru = paises.body.data.find((p: { codigoIso2: string }) => p.codigoIso2 === 'PE');
    expect(peru).toBeDefined();

    const departamentos = await request(app)
      .get(`/api/demo/divisiones-administrativas?paisId=${peru.id}`)
      .expect(200);
    expect(departamentos.body.data.length).toBeGreaterThan(20);
  });
});

describe('Empresa: país y distrito derivan el ubigeo', () => {
  it('el registro público con distritoId guarda el ubigeo derivado del distrito', async () => {
    const cualquiera = await crearEmpresaDePrueba('GeografiaRegistroPublico');
    const { peru, distrito } = await unDistritoDePeru(cualquiera);

    const tipos = await api
      .get('/api/catalogos/tipos-documento-identidad', cualquiera)
      .expect(200);
    const sufijo = Date.now().toString().slice(-9);

    const registro = await request(app)
      .post('/api/demo/registrar')
      .send({
        ruc: `20${sufijo}`,
        razonSocial: `Geografia Test ${sufijo} SAC`,
        nombres: 'Prueba',
        apellidoPaterno: 'Geografia',
        tipoDocumentoIdentidadId: tipos.body.data[0].id,
        numeroDocumento: sufijo.slice(0, 8),
        email: `geografia.${sufijo}@ejemplo.test`,
        password: 'ClaveDePrueba2026!',
        distritoId: distrito.id,
      })
      .expect(201);

    const token = registro.body.data.accessToken as string;
    const sesion = {
      token,
      empresaId: registro.body.data.empresa.id,
      h: { Authorization: `Bearer ${token}` },
    };

    const empresas = await api.get('/api/empresas', sesion).expect(200);
    const empresa = empresas.body.data[0];
    expect(empresa.pais.id).toBe(peru.id);
    expect(empresa.distrito.id).toBe(distrito.id);
    expect(empresa.ubigeo).toBe(distrito.codigo);
  });

  it('editar la empresa con un distrito distinto actualiza el ubigeo, y quitarlo lo deja en null', async () => {
    const cualquiera = await crearEmpresaDePrueba('GeografiaCatalogoEdicion');
    const { distrito } = await unDistritoDePeru(cualquiera);

    // Empresa propia de esta prueba (no la del admin compartido con el resto de la suite):
    // editar geografía no debe dejar estado mutado que otra prueba dé por sentado.
    const sesion = await crearEmpresaDePrueba('GeografiaEdicion');

    const actualizada = await api
      .put(`/api/empresas/${sesion.empresaId}`, sesion, { distritoId: distrito.id })
      .expect(200);
    expect(actualizada.body.data.distrito.id).toBe(distrito.id);
    expect(actualizada.body.data.ubigeo).toBe(distrito.codigo);

    const sinDistrito = await api
      .put(`/api/empresas/${sesion.empresaId}`, sesion, { distritoId: null })
      .expect(200);
    expect(sinDistrito.body.data.distrito).toBeNull();
    expect(sinDistrito.body.data.ubigeo).toBeNull();
  });
});
