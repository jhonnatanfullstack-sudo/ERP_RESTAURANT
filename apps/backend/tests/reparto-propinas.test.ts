import { describe, expect, it } from 'vitest';
import { api, catalogos, empresaConProducto, iniciarSesion } from './ayudantes';
import { ejecutarEnTransaccionPropia } from '../src/database/tenant-context';
import { ventaRepository } from '../src/modules/ventas/venta.repository';
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

/** Ventana `[ahora + desdeMin, ahora + hastaMin)` en minutos — para construir rangos con una
 * relación exacta entre sí (idéntico, solapado, contenido) sin depender de la duración real de
 * la prueba (H20). */
function ventana(
  desdeMin: number,
  hastaMin: number,
  ahora = Date.now(),
): { fechaDesde: string; fechaHasta: string } {
  return {
    fechaDesde: new Date(ahora + desdeMin * 60_000).toISOString(),
    fechaHasta: new Date(ahora + hastaMin * 60_000).toISOString(),
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

/**
 * H20 — `crearReparto` no verificaba si ya existía un reparto sobre el mismo período o uno que
 * se superpusiera: `calcularTotalPropinas`/`calcularParticipantes` se limitan a sumar lo que
 * haya en el rango recibido, sin excluir nada ya repartido. Estos tests reproducen exactamente
 * los escenarios de solapamiento (idéntico, parcial, contenido), confirman que los rangos
 * adyacentes bajo semántica `[fechaDesde, fechaHasta)` SÍ deben permitirse, que dos empresas
 * distintas pueden compartir el mismo rango, y que la defensa resiste una carrera real
 * (concurrente, no solo secuencial).
 */
describe('H20 — un reparto no puede repartir dos veces las mismas propinas', () => {
  it('RED-1: duplicado exacto del mismo rango se rechaza; solo persiste un reparto', async () => {
    const { sesion, productoId } = await empresaConProducto();
    await crearVentaConPropina(sesion, productoId, 10);
    await abrirYCerrarTurno(sesion);

    const rango = rangoAmplio();
    await api.post('/api/propinas', sesion, { ...rango, metodo: 'igualitario' }).expect(201);

    const segundo = await api.post('/api/propinas', sesion, { ...rango, metodo: 'igualitario' });
    expect(segundo.status).toBe(409);

    const listado = await api.get('/api/propinas', sesion).expect(200);
    expect(listado.body.data).toHaveLength(1);
  });

  it('RED-2: solapamiento parcial [ , ) con otro reparto existente se rechaza', async () => {
    const { sesion, productoId } = await empresaConProducto();
    // `ahora` se captura ANTES de crear la venta/turno, para que su marca de tiempo real caiga
    // ligeramente DESPUÉS de `ahora` y por lo tanto dentro de r2 (que empieza exactamente en
    // `ahora`, inclusive) — si se capturara después, el evento real quedaría antes del inicio
    // de r2 y r2 no vería ninguna propina (falso negativo de la prueba, no del código).
    const ahora = Date.now();
    await crearVentaConPropina(sesion, productoId, 10);
    await abrirYCerrarTurno(sesion);

    const r1 = ventana(-60, 30, ahora); // [-60, 30)
    const r2 = ventana(0, 90, ahora); // [0, 90) — se solapa con r1 en [0, 30)

    await api.post('/api/propinas', sesion, { ...r1, metodo: 'igualitario' }).expect(201);
    const segundo = await api.post('/api/propinas', sesion, { ...r2, metodo: 'igualitario' });
    expect(segundo.status).toBe(409);

    const listado = await api.get('/api/propinas', sesion).expect(200);
    expect(listado.body.data).toHaveLength(1);
  });

  it('RED-3: un rango contenido dentro de un reparto existente se rechaza', async () => {
    const { sesion, productoId } = await empresaConProducto();
    await crearVentaConPropina(sesion, productoId, 10);
    await abrirYCerrarTurno(sesion);

    const ahora = Date.now();
    const r1 = ventana(-60, 60, ahora); // rango amplio
    const r2 = ventana(-10, 10, ahora); // contenido dentro de r1

    await api.post('/api/propinas', sesion, { ...r1, metodo: 'igualitario' }).expect(201);
    const segundo = await api.post('/api/propinas', sesion, { ...r2, metodo: 'igualitario' });
    expect(segundo.status).toBe(409);

    const listado = await api.get('/api/propinas', sesion).expect(200);
    expect(listado.body.data).toHaveLength(1);
  });

  it('RED-4: rangos adyacentes [a,b) y [b,c) no se solapan; la venta exacta en el límite pertenece solo al segundo', async () => {
    const { sesion, productoId, catalogos: cat } = await empresaConProducto();

    // Propina + participante que deben quedar SOLO del lado del primer rango (antes del límite).
    await crearVentaConPropina(sesion, productoId, 5);
    await abrirYCerrarTurno(sesion);

    const limite = new Date();

    // Venta creada justo en el límite exacto: se fuerza su `creadoEn` al instante `limite` con
    // el repositorio tenant-aware (mismo mecanismo de H18-B.1) — la API no permite fijar
    // `creadoEn` manualmente, y es exactamente ese instante el que se quiere probar.
    const ventaLimite = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: cat.boletaId,
        formaPago: 'contado',
        medioPagoId: cat.efectivoId,
        propina: 10,
      })
      .expect(201);
    await ejecutarEnTransaccionPropia(sesion.empresaId, async () => {
      const venta = await ventaRepository.findOneByOrFail({ id: ventaLimite.body.data.id });
      venta.creadoEn = limite;
      await ventaRepository.save(venta);
    });

    // Participante que debe quedar SOLO del lado del segundo rango (en o después del límite).
    const sesionMesero = await crearSegundaSesion(sesion, '4444');
    await abrirYCerrarTurno(sesionMesero);

    const r1 = {
      fechaDesde: new Date(limite.getTime() - 60 * 60_000).toISOString(),
      fechaHasta: limite.toISOString(),
    }; // [limite-60min, limite) — excluye la venta exacta en el límite
    const r2 = {
      fechaDesde: limite.toISOString(),
      fechaHasta: new Date(limite.getTime() + 60 * 60_000).toISOString(),
    }; // [limite, limite+60min) — incluye la venta exacta en el límite

    const reparto1 = await api
      .post('/api/propinas', sesion, { ...r1, metodo: 'igualitario' })
      .expect(201);
    const reparto2 = await api
      .post('/api/propinas', sesion, { ...r2, metodo: 'igualitario' })
      .expect(201);

    // La venta del límite (propina=10) cuenta exclusivamente para r2; r1 solo ve la propina
    // anterior al límite (5) — confirma que el constraint (EXCLUDE `[)`) y la selección de
    // ventas (`calcularTotalPropinas`) usan la misma semántica temporal.
    expect(reparto1.body.data.totalPropinas).toBe(5);
    expect(reparto2.body.data.totalPropinas).toBe(10);

    const listado = await api.get('/api/propinas', sesion).expect(200);
    expect(listado.body.data).toHaveLength(2);
  });

  it('RED-5: dos empresas distintas pueden repartir exactamente el mismo rango sin conflicto', async () => {
    const empresaA = await empresaConProducto();
    const empresaB = await empresaConProducto();

    await crearVentaConPropina(empresaA.sesion, empresaA.productoId, 10);
    await abrirYCerrarTurno(empresaA.sesion);
    await crearVentaConPropina(empresaB.sesion, empresaB.productoId, 20);
    await abrirYCerrarTurno(empresaB.sesion);

    const rango = rangoAmplio();
    const repartoA = await api
      .post('/api/propinas', empresaA.sesion, { ...rango, metodo: 'igualitario' })
      .expect(201);
    const repartoB = await api
      .post('/api/propinas', empresaB.sesion, { ...rango, metodo: 'igualitario' })
      .expect(201);

    expect(repartoA.body.data.totalPropinas).toBe(10);
    expect(repartoB.body.data.totalPropinas).toBe(20);
  });

  it('RED-6: dos creaciones concurrentes sobre el mismo rango: exactamente una 201 y una 409, un solo reparto en BD', async () => {
    const { sesion, productoId } = await empresaConProducto();
    await crearVentaConPropina(sesion, productoId, 10);
    await abrirYCerrarTurno(sesion);

    const rango = rangoAmplio();
    const [a, b] = await Promise.all([
      api.post('/api/propinas', sesion, { ...rango, metodo: 'igualitario' }).then((r) => r),
      api.post('/api/propinas', sesion, { ...rango, metodo: 'igualitario' }).then((r) => r),
    ]);

    const estados = [a.status, b.status].sort();
    expect(estados).toEqual([201, 409]);

    const listado = await api.get('/api/propinas', sesion).expect(200);
    expect(listado.body.data).toHaveLength(1);
  });
});
