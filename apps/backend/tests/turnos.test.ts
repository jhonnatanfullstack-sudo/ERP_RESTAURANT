import { describe, expect, it } from 'vitest';
import { api, crearEmpresaDePrueba } from './ayudantes';

/**
 * Turnos de personal: "Iniciar turno" / "Terminar turno" por usuario. A diferencia de Caja
 * (una sola sesión abierta por empresa), varias personas pueden tener un turno abierto al
 * mismo tiempo — lo único que no puede pasar es que la misma persona tenga dos a la vez.
 */
describe('Turnos de personal', () => {
  it('abre un turno, lo refleja en "mi turno" y no permite abrir uno segundo', async () => {
    const sesion = await crearEmpresaDePrueba();

    const sinTurno = await api.get('/api/turnos/mi-turno', sesion).expect(200);
    expect(sinTurno.body.data).toBeNull();

    const abierto = await api
      .post('/api/turnos/abrir', sesion, { nota: 'Llegué a las 8am' })
      .expect(201);
    expect(abierto.body.data.estado).toBe('abierto');
    expect(abierto.body.data.notaApertura).toBe('Llegué a las 8am');
    expect(abierto.body.data.fechaCierre).toBeNull();

    const miTurno = await api.get('/api/turnos/mi-turno', sesion).expect(200);
    expect(miTurno.body.data.id).toBe(abierto.body.data.id);

    await api.post('/api/turnos/abrir', sesion, {}).expect(409);
  });

  it('cierra un turno abierto y no permite cerrarlo dos veces', async () => {
    const sesion = await crearEmpresaDePrueba();

    const abierto = await api.post('/api/turnos/abrir', sesion, {}).expect(201);

    const cerrado = await api
      .post(`/api/turnos/${abierto.body.data.id}/cerrar`, sesion, { nota: 'Fin de jornada' })
      .expect(200);
    expect(cerrado.body.data.estado).toBe('cerrado');
    expect(cerrado.body.data.notaCierre).toBe('Fin de jornada');
    expect(cerrado.body.data.fechaCierre).not.toBeNull();
    expect(cerrado.body.data.usuarioCierre).not.toBeNull();

    await api.post(`/api/turnos/${abierto.body.data.id}/cerrar`, sesion, {}).expect(400);

    const miTurno = await api.get('/api/turnos/mi-turno', sesion).expect(200);
    expect(miTurno.body.data).toBeNull();

    // Con el anterior ya cerrado, puede abrir uno nuevo sin problema.
    await api.post('/api/turnos/abrir', sesion, {}).expect(201);
  });

  it('no deja ver los turnos de otra empresa (aislamiento RLS)', async () => {
    const empresaA = await crearEmpresaDePrueba('Turnos A');
    const empresaB = await crearEmpresaDePrueba('Turnos B');

    const turnoA = await api.post('/api/turnos/abrir', empresaA, {}).expect(201);

    const listaB = await api.get('/api/turnos', empresaB).expect(200);
    expect(listaB.body.data.some((t: { id: string }) => t.id === turnoA.body.data.id)).toBe(
      false,
    );

    await api.get(`/api/turnos/${turnoA.body.data.id}`, empresaB).expect(404);
  });
});
