import { describe, expect, it } from 'vitest';
import { api, catalogos, empresaConProducto, iniciarSesion } from './ayudantes';
import type { Sesion } from './ayudantes';

/**
 * Reparto de propinas entre el personal que trabajó un período. Los participantes salen de
 * `turnos` (quien tuvo un turno cerrado dentro del rango) y el total de `ventas.propina` —
 * ningún dato nuevo en Pedidos/Ventas. Las pruebas abren y cierran turnos "de verdad" (sin
 * forzar fechas) y usan un rango `[hace 1 hora, dentro de 1 hora]` para no depender de la
 * duración exacta de la prueba.
 */

function rangoAmplio(): { fechaDesde: string; fechaHasta: string } {
  const ahora = Date.now();
  return {
    fechaDesde: new Date(ahora - 60 * 60 * 1000).toISOString(),
    fechaHasta: new Date(ahora + 60 * 60 * 1000).toISOString(),
  };
}

async function crearVentaConPropina(sesion: Sesion, productoId: string, propina: number) {
  const cat = await catalogos(sesion);
  return api
    .post('/api/ventas', sesion, {
      detalles: [{ productoId, cantidad: 1 }],
      tipoComprobanteId: cat.boletaId,
      formaPago: 'contado',
      medioPagoId: cat.efectivoId,
      propina,
    })
    .expect(201);
}

/** Crea un segundo usuario en la misma empresa (mismo rol que el admin, para no depender de
 * permisos específicos) y devuelve su propia sesión — necesario para que abra su propio turno,
 * ya que "abrir" siempre es de quien está autenticado. */
async function crearSegundaSesion(sesion: Sesion, sufijo: string): Promise<Sesion> {
  const tipos = await api.get('/api/catalogos/tipos-documento-identidad', sesion).expect(200);
  const dniId = tipos.body.data[0].id;
  const yo = await api.get('/api/auth/me', sesion).expect(200);
  const rolId = yo.body.data.rol.id;

  const personal = await api
    .post('/api/personal', sesion, {
      empresaId: sesion.empresaId,
      tipoDocumentoIdentidadId: dniId,
      numeroDocumento: `5${sufijo}`.padStart(8, '0'),
      nombres: 'Mesero',
      apellidoPaterno: sufijo,
    })
    .expect(201);

  const email = `mesero.${sufijo}.${Date.now()}@ejemplo.test`;
  const password = 'ClaveDePrueba2026!';
  await api
    .post('/api/usuarios', sesion, { personalId: personal.body.data.id, rolId, email, password })
    .expect(201);

  return iniciarSesion(email, password);
}

async function abrirYCerrarTurno(sesion: Sesion) {
  const abierto = await api.post('/api/turnos/abrir', sesion, {}).expect(201);
  await api.post(`/api/turnos/${abierto.body.data.id}/cerrar`, sesion, {}).expect(200);
}

describe('Reparto de propinas', () => {
  it('sin propinas en el período, no deja repartir', async () => {
    const { sesion } = await empresaConProducto();
    await abrirYCerrarTurno(sesion);

    await api
      .post('/api/propinas', sesion, { ...rangoAmplio(), metodo: 'igualitario' })
      .expect(400);
  });

  it('sin nadie con turno cerrado en el período, no deja repartir aunque haya propinas', async () => {
    const { sesion, productoId } = await empresaConProducto();
    await crearVentaConPropina(sesion, productoId, 10);

    await api
      .post('/api/propinas', sesion, { ...rangoAmplio(), metodo: 'igualitario' })
      .expect(409);
  });

  it('con un solo participante, se lleva el 100% de las propinas', async () => {
    const { sesion, productoId } = await empresaConProducto();
    await crearVentaConPropina(sesion, productoId, 10);
    await abrirYCerrarTurno(sesion);

    const rango = rangoAmplio();
    const vistaPrevia = await api
      .get(
        `/api/propinas/vista-previa?fechaDesde=${encodeURIComponent(rango.fechaDesde)}&fechaHasta=${encodeURIComponent(rango.fechaHasta)}&metodo=igualitario`,
        sesion,
      )
      .expect(200);
    expect(vistaPrevia.body.data.totalPropinas).toBe(10);
    expect(vistaPrevia.body.data.participantes).toHaveLength(1);
    expect(vistaPrevia.body.data.participantes[0].monto).toBe(10);

    const reparto = await api.post('/api/propinas', sesion, { ...rango, metodo: 'igualitario' }).expect(201);
    expect(reparto.body.data.totalPropinas).toBe(10);
    expect(reparto.body.data.detalles).toHaveLength(1);
    expect(reparto.body.data.detalles[0].monto).toBe(10);
    expect(reparto.body.data.detalles[0].horasTrabajadas).toBeNull();

    const listado = await api.get('/api/propinas', sesion).expect(200);
    expect(listado.body.data).toHaveLength(1);

    const detalle = await api.get(`/api/propinas/${reparto.body.data.id}`, sesion).expect(200);
    expect(detalle.body.data.id).toBe(reparto.body.data.id);
  });

  it('reparte igualitario entre dos personas y cuadra centavos exactos', async () => {
    const { sesion, productoId } = await empresaConProducto();
    await crearVentaConPropina(sesion, productoId, 10.01);
    await abrirYCerrarTurno(sesion);
    const sesionMesero = await crearSegundaSesion(sesion, '0001');
    await abrirYCerrarTurno(sesionMesero);

    const reparto = await api
      .post('/api/propinas', sesion, { ...rangoAmplio(), metodo: 'igualitario' })
      .expect(201);
    expect(reparto.body.data.totalPropinas).toBe(10.01);
    expect(reparto.body.data.detalles).toHaveLength(2);

    const sumaMontos = reparto.body.data.detalles.reduce(
      (suma: number, d: { monto: number }) => suma + d.monto,
      0,
    );
    // 10.01 / 2 = 5.005 → cada quien redondea a 5.01/5.00 o 5.00/5.01, pero la suma debe cuadrar
    // exacto con el total, sin perder ni ganar el centavo impar del redondeo.
    expect(Math.round(sumaMontos * 100) / 100).toBe(10.01);
  });

  it('por horas registra las horas trabajadas y la suma de montos cuadra con el total', async () => {
    const { sesion, productoId } = await empresaConProducto();
    await crearVentaConPropina(sesion, productoId, 7);
    await abrirYCerrarTurno(sesion);

    const reparto = await api
      .post('/api/propinas', sesion, { ...rangoAmplio(), metodo: 'por_horas' })
      .expect(201);

    expect(reparto.body.data.detalles).toHaveLength(1);
    expect(reparto.body.data.detalles[0].horasTrabajadas).toBeGreaterThanOrEqual(0);
    const sumaMontos = reparto.body.data.detalles.reduce(
      (suma: number, d: { monto: number }) => suma + d.monto,
      0,
    );
    expect(Math.round(sumaMontos * 100) / 100).toBe(7);
  });

  it('rechaza un rango con fecha final anterior o igual a la inicial', async () => {
    const { sesion } = await empresaConProducto();
    const ahora = new Date().toISOString();
    await api
      .post('/api/propinas', sesion, {
        fechaDesde: ahora,
        fechaHasta: ahora,
        metodo: 'igualitario',
      })
      .expect(400);
  });

  it('no deja ver los repartos de otra empresa (RLS)', async () => {
    const empresaA = await empresaConProducto();
    const empresaB = await empresaConProducto();

    await crearVentaConPropina(empresaA.sesion, empresaA.productoId, 5);
    await abrirYCerrarTurno(empresaA.sesion);
    const reparto = await api
      .post('/api/propinas', empresaA.sesion, { ...rangoAmplio(), metodo: 'igualitario' })
      .expect(201);

    const listaB = await api.get('/api/propinas', empresaB.sesion).expect(200);
    expect(listaB.body.data.some((r: { id: string }) => r.id === reparto.body.data.id)).toBe(
      false,
    );
    await api.get(`/api/propinas/${reparto.body.data.id}`, empresaB.sesion).expect(404);
  });
});
