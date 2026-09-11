import request from 'supertest';
import { app } from '../src/app';

export const ADMIN_INICIAL = {
  email: 'admin@restaurant.local',
  password: 'CambiarInmediatamente123!',
};

export interface Sesion {
  token: string;
  empresaId: string;
  /** Cabeceras listas para usar en `supertest`. */
  h: Record<string, string>;
}

function sesionDesde(token: string): Sesion {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as {
    empresaId: string;
  };
  return {
    token,
    empresaId: payload.empresaId,
    h: { Authorization: `Bearer ${token}` },
  };
}

/** Inicia sesión y devuelve el token junto con la empresa que lleva dentro. */
export async function iniciarSesion(email: string, password: string): Promise<Sesion> {
  const respuesta = await request(app).post('/api/auth/login').send({ email, password });
  if (respuesta.status !== 200) {
    throw new Error(`Login falló (${respuesta.status}): ${JSON.stringify(respuesta.body)}`);
  }
  return sesionDesde(respuesta.body.data.accessToken);
}

let sesionAdminCacheada: Sesion | null = null;

/**
 * Sesión de la empresa que crea la migración de arranque (`RUC 20000000001`).
 *
 * Se cachea por archivo de pruebas: es la misma sesión siempre, y volver a autenticarse en
 * cada caso solo suma latencia (bcrypt con 12 rondas no es gratis) sin probar nada nuevo.
 */
export async function sesionAdminInicial(): Promise<Sesion> {
  sesionAdminCacheada ??= await iniciarSesion(ADMIN_INICIAL.email, ADMIN_INICIAL.password);
  return sesionAdminCacheada;
}

let contador = 0;

/**
 * Crea una empresa completa por el registro público y devuelve su sesión.
 *
 * Se usa el mismo endpoint que usaría un visitante en vez de insertar filas a mano: así cada
 * prueba que necesita un segundo restaurante ejercita también el aprovisionamiento real
 * (rol, personal, usuario y almacén), y una regresión ahí se detecta aunque ninguna prueba
 * apunte directamente al registro.
 *
 * El límite de 5 registros por hora y por IP se desactiva en las pruebas (ver
 * `demo.routes.ts`): si no, a partir del sexto caso todo empezaría a fallar con 429.
 */
export async function crearEmpresaDePrueba(nombre = 'Restaurante'): Promise<Sesion> {
  contador += 1;
  const sufijo = String(contador).padStart(4, '0');
  const admin = await sesionAdminInicial();

  const tipos = await request(app)
    .get('/api/catalogos/tipos-documento-identidad')
    .set(admin.h)
    .expect(200);

  const respuesta = await request(app)
    .post('/api/demo/registrar')
    .send({
      // RUC de 11 dígitos, único por prueba: es la restricción que impide dos cuentas por
      // negocio, así que cada empresa de prueba necesita el suyo.
      ruc: `20${Date.now().toString().slice(-5)}${sufijo}`.slice(0, 11),
      razonSocial: `${nombre} ${sufijo} SAC`,
      nombreComercial: `${nombre} ${sufijo}`,
      telefono: '987654321',
      nombres: 'Prueba',
      apellidoPaterno: 'Automatizada',
      tipoDocumentoIdentidadId: tipos.body.data[0].id,
      numeroDocumento: `4000${sufijo}`,
      email: `prueba.${Date.now()}.${sufijo}@ejemplo.test`,
      password: 'ClaveDePrueba2026!',
    });

  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear la empresa de prueba (${respuesta.status}): ${JSON.stringify(respuesta.body)}`,
    );
  }
  return sesionDesde(respuesta.body.data.accessToken);
}

/** Atajo para las peticiones autenticadas más habituales en las pruebas. */
export const api = {
  get: (ruta: string, sesion: Sesion) => request(app).get(ruta).set(sesion.h),
  post: (ruta: string, sesion: Sesion, cuerpo?: object) =>
    request(app).post(ruta).set(sesion.h).send(cuerpo),
  put: (ruta: string, sesion: Sesion, cuerpo?: object) =>
    request(app).put(ruta).set(sesion.h).send(cuerpo),
  delete: (ruta: string, sesion: Sesion) => request(app).delete(ruta).set(sesion.h),
};

/** Catálogos globales (SUNAT), compartidos por todas las empresas. */
export async function catalogos(sesion: Sesion) {
  const traer = async (ruta: string) =>
    (await api.get(`/api/catalogos/${ruta}`, sesion).expect(200)).body.data;
  const [unidades, afectaciones, comprobantes, medios] = await Promise.all([
    traer('unidades-medida'),
    traer('tipos-afectacion-igv'),
    traer('tipos-comprobante'),
    traer('medios-pago'),
  ]);
  return {
    unidadMedidaId: unidades[0].id,
    // "10" es Gravado - Operación Onerosa; lo demás (exonerado, inafecto) no lleva IGV.
    gravadoId: afectaciones.find((t: { codigo: string }) => t.codigo === '10').id,
    exoneradoId: afectaciones.find((t: { codigo: string }) => t.codigo === '20')?.id ?? null,
    boletaId: comprobantes.find((t: { codigo: string }) => t.codigo === '03').id,
    facturaId: comprobantes.find((t: { codigo: string }) => t.codigo === '01').id,
    // Por código y no por posición: el catálogo viene ordenado alfabéticamente, así que el
    // primero es "Cheque" — que exige banco y número de operación, y haría fallar con 400
    // cualquier venta de prueba por una razón que no tiene que ver con lo que se prueba.
    efectivoId: medios.find((m: { codigo: string }) => m.codigo === 'efectivo').id,
  };
}

/**
 * Deja una empresa lista para vender: una categoría y un producto con precio conocido.
 * Devuelve los ids que las pruebas necesitan para armar pedidos y ventas.
 */
export async function empresaConProducto(precio = 118, afectacion?: string) {
  const sesion = await crearEmpresaDePrueba();
  const cat = await catalogos(sesion);

  const categoria = await api.post('/api/categorias', sesion, { nombre: 'PLATOS' }).expect(201);

  const producto = await api
    .post('/api/productos', sesion, {
      categoriaId: categoria.body.data.id,
      unidadMedidaId: cat.unidadMedidaId,
      tipoAfectacionIgvId: afectacion ?? cat.gravadoId,
      nombre: 'PLATO DE PRUEBA',
      precio,
    })
    .expect(201);

  return {
    sesion,
    catalogos: cat,
    categoriaId: categoria.body.data.id,
    productoId: producto.body.data.id,
  };
}
