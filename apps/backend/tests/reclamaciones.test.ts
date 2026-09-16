import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { api, empresaConProducto } from './ayudantes';

/**
 * Libro de Reclamaciones Virtual (Ley 29571): el consumidor lo llena desde la carta pública
 * sin autenticarse y sin tener que ser cliente registrado — se prueba también que un reclamo
 * de una empresa no se filtre a otra (RLS) y que el staff pueda verlo y responderlo.
 */

async function empresaConTipoDocumento() {
  const { sesion } = await empresaConProducto();
  const empresa = await api.get(`/api/empresas/${sesion.empresaId}`, sesion).expect(200);
  const slug = empresa.body.data.slug as string;

  const tipos = await api.get('/api/catalogos/tipos-documento-identidad', sesion).expect(200);
  const tipoDocumentoIdentidadId = tipos.body.data[0].id as string;

  return { sesion, slug, tipoDocumentoIdentidadId };
}

function payloadReclamo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tipo: 'reclamo',
    consumidorNombres: 'Ana',
    consumidorApellidos: 'Torres',
    consumidorNumeroDocumento: '45678912',
    consumidorDomicilio: 'Av. Los Álamos 123, Lima',
    consumidorEmail: 'ana.torres@ejemplo.test',
    consumidorTelefono: '987654321',
    descripcionBien: 'Ají de gallina',
    detalle: 'El plato llegó frío y tuve que esperar más de una hora para que me lo cambien.',
    pedido: 'Solicito la devolución del dinero pagado.',
    ...overrides,
  };
}

describe('Libro de Reclamaciones — alta pública', () => {
  it('registra un reclamo sin autenticarse y numera desde 1', async () => {
    const { slug, tipoDocumentoIdentidadId } = await empresaConTipoDocumento();

    const respuesta = await request(app)
      .post(`/api/publico/${slug}/reclamaciones`)
      .send(payloadReclamo({ tipoDocumentoIdentidadId }))
      .expect(201);

    expect(respuesta.body.data.numero).toBe(1);
    expect(respuesta.body.data.estado).toBe('pendiente');
    expect(respuesta.body.data.tipo).toBe('reclamo');
  });

  it('el segundo reclamo de la misma empresa numera correlativo', async () => {
    const { slug, tipoDocumentoIdentidadId } = await empresaConTipoDocumento();

    await request(app)
      .post(`/api/publico/${slug}/reclamaciones`)
      .send(payloadReclamo({ tipoDocumentoIdentidadId }))
      .expect(201);
    const segundo = await request(app)
      .post(`/api/publico/${slug}/reclamaciones`)
      .send(payloadReclamo({ tipoDocumentoIdentidadId, tipo: 'queja' }))
      .expect(201);

    expect(segundo.body.data.numero).toBe(2);
    expect(segundo.body.data.tipo).toBe('queja');
  });

  it('si el consumidor es menor de edad, exige los datos del apoderado', async () => {
    const { slug, tipoDocumentoIdentidadId } = await empresaConTipoDocumento();

    await request(app)
      .post(`/api/publico/${slug}/reclamaciones`)
      .send(payloadReclamo({ tipoDocumentoIdentidadId, esMenorEdad: true }))
      .expect(400);
  });

  it('no exige que el consumidor sea cliente registrado ni tenga una compra', async () => {
    // El propio payload de prueba ya no referencia ninguna venta/cliente — esto documenta
    // que el endpoint lo acepta igual, que es justo lo que exige el reglamento.
    const { slug, tipoDocumentoIdentidadId } = await empresaConTipoDocumento();

    await request(app)
      .post(`/api/publico/${slug}/reclamaciones`)
      .send(payloadReclamo({ tipoDocumentoIdentidadId }))
      .expect(201);
  });

  it('devuelve la razón social y el RUC del proveedor para la cabecera del formulario', async () => {
    const { slug } = await empresaConTipoDocumento();

    const respuesta = await request(app)
      .get(`/api/publico/${slug}/reclamaciones/empresa`)
      .expect(200);

    expect(respuesta.body.data.ruc).toMatch(/^\d{11}$/);
    expect(respuesta.body.data.razonSocial).toBeTruthy();
  });
});

describe('Libro de Reclamaciones — gestión del staff', () => {
  it('el staff ve el reclamo y puede responderlo', async () => {
    const { sesion, slug, tipoDocumentoIdentidadId } = await empresaConTipoDocumento();

    const creado = await request(app)
      .post(`/api/publico/${slug}/reclamaciones`)
      .send(payloadReclamo({ tipoDocumentoIdentidadId }))
      .expect(201);

    const lista = await api.get('/api/reclamaciones', sesion).expect(200);
    expect(lista.body.data.some((r: { id: string }) => r.id === creado.body.data.id)).toBe(true);

    const respondido = await api
      .post(`/api/reclamaciones/${creado.body.data.id}/responder`, sesion, {
        respuestaProveedor: 'Le ofrecimos un plato de cortesía y confirmamos la devolución.',
      })
      .expect(200);

    expect(respondido.body.data.estado).toBe('atendido');
    expect(respondido.body.data.respuestaProveedor).toContain('devolución');
  });

  it('los reclamos de una empresa no se filtran a otra (RLS)', async () => {
    const { slug: slugA, tipoDocumentoIdentidadId: tipoA } = await empresaConTipoDocumento();
    const { sesion: sesionB } = await empresaConTipoDocumento();

    await request(app)
      .post(`/api/publico/${slugA}/reclamaciones`)
      .send(payloadReclamo({ tipoDocumentoIdentidadId: tipoA }))
      .expect(201);

    const listaB = await api.get('/api/reclamaciones', sesionB).expect(200);
    expect(listaB.body.data).toHaveLength(0);
  });
});
