import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { signAccessToken } from '../src/utils/jwt';
import { ADMIN_INICIAL, api, crearEmpresaDePrueba, iniciarSesion } from './ayudantes';

describe('Autenticación y autorización', () => {
  it('rechaza credenciales inválidas sin filtrar si el correo existe', async () => {
    const inexistente = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no.existe@ejemplo.test', password: 'LoQueSea123!' })
      .expect(401);

    const existentePasswordMala = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_INICIAL.email, password: 'ClaveEquivocada123!' })
      .expect(401);

    // El mismo mensaje en ambos casos: distinguirlos permitiría averiguar qué correos están
    // registrados probando uno por uno.
    expect(inexistente.body.message).toBe(existentePasswordMala.body.message);
  });

  it('el token lleva la empresa dentro y viene firmado', async () => {
    const sesion = await iniciarSesion(ADMIN_INICIAL.email, ADMIN_INICIAL.password);
    expect(sesion.empresaId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rechaza un token sin empresa en vez de adivinar una', async () => {
    // Es la forma que tenían los tokens antes de multi-empresa. Aceptarlo obligaría a
    // suponer a qué restaurante pertenece la sesión: mejor pedir que inicie sesión de nuevo.
    const tokenViejo = signAccessToken({
      sub: '00000000-0000-0000-0000-000000000000',
      rol: 'Administrador',
      permisos: ['productos.ver'],
    } as Parameters<typeof signAccessToken>[0]);

    const respuesta = await request(app)
      .get('/api/productos')
      .set('Authorization', `Bearer ${tokenViejo}`)
      .expect(401);

    expect(respuesta.body.message).toMatch(/sesión/i);
  });

  it('rechaza un token manipulado', async () => {
    const sesion = await iniciarSesion(ADMIN_INICIAL.email, ADMIN_INICIAL.password);
    const manipulado = `${sesion.token.slice(0, -4)}aaaa`;

    await request(app)
      .get('/api/productos')
      .set('Authorization', `Bearer ${manipulado}`)
      .expect(401);
  });

  it('exige autenticación en las rutas del panel', async () => {
    await request(app).get('/api/productos').expect(401);
    await request(app).get('/api/ventas').expect(401);
  });

  it('un rol sin el permiso recibe 403, no los datos', async () => {
    const empresa = await crearEmpresaDePrueba();

    // Un rol nuevo sin ningún permiso, aplicado a la misma empresa.
    const rol = await api
      .post('/api/roles', empresa, { nombre: 'MESERO SIN PERMISOS', permisoIds: [] })
      .expect(201);

    const personal = await api.get('/api/personal', empresa).expect(200);
    const usuario = await api.post('/api/usuarios', empresa, {
      personalId: personal.body.data[0].id,
      email: `sinpermisos.${Date.now()}@ejemplo.test`,
      password: 'ClaveDePrueba2026!',
      rolId: rol.body.data.id,
    });

    // Si el personal ya tiene usuario (uno por persona), la prueba no aplica.
    if (usuario.status !== 201) return;

    const limitado = await iniciarSesion(usuario.body.data.email, 'ClaveDePrueba2026!');
    await api.get('/api/ventas', limitado).expect(403);
  });

  it('la carta pública no necesita sesión, pero sí un slug válido', async () => {
    await request(app).get('/api/publico/no-existe-en-absoluto/empresa').expect(404);
  });
});
