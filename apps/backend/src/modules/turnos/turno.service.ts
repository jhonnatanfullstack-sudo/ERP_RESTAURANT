import { HttpError } from '../../utils/http-error';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { turnoRepository } from './turno.repository';
import { EstadoTurno, Turno } from './turno.entity';
import type { AbrirTurnoDto, CerrarTurnoDto } from './turno.dto';

const RELACIONES = {
  usuario: { personal: true },
  usuarioCierre: { personal: true },
} as const;

async function resolverUsuario(usuarioId: string) {
  const usuario = await usuarioRepository.findOne({
    where: { id: usuarioId },
    relations: { personal: true },
  });
  if (!usuario) {
    throw new HttpError(401, 'Usuario no encontrado');
  }
  return usuario;
}

export async function listarTurnos(): Promise<Turno[]> {
  return turnoRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
}

export async function obtenerTurno(id: string): Promise<Turno> {
  const turno = await turnoRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!turno) {
    throw new HttpError(404, 'Turno no encontrado');
  }
  return turno;
}

/** El turno abierto del usuario autenticado, si tiene uno — es lo que decide si su pantalla
 * de "Mi turno" ofrece "Iniciar turno" o "Terminar turno". */
export async function obtenerTurnoAbiertoDeUsuario(usuarioId: string): Promise<Turno | null> {
  return turnoRepository.findOne({
    where: { usuario: { id: usuarioId }, estado: EstadoTurno.ABIERTO },
    relations: RELACIONES,
  });
}

export async function abrirTurno(usuarioId: string, dto: AbrirTurnoDto): Promise<Turno> {
  const existente = await turnoRepository.findOneBy({
    usuario: { id: usuarioId },
    estado: EstadoTurno.ABIERTO,
  });
  if (existente) {
    throw new HttpError(409, 'Ya tienes un turno abierto. Ciérralo antes de abrir otro.');
  }

  const usuario = await resolverUsuario(usuarioId);
  const turno = turnoRepository.create({
    usuario,
    notaApertura: dto.nota ?? null,
    estado: EstadoTurno.ABIERTO,
  });
  const guardado = await turnoRepository.save(turno);
  return obtenerTurno(guardado.id);
}

export async function cerrarTurno(
  id: string,
  usuarioId: string,
  dto: CerrarTurnoDto,
): Promise<Turno> {
  const turno = await turnoRepository.findOneBy({ id });
  if (!turno) {
    throw new HttpError(404, 'Turno no encontrado');
  }
  if (turno.estado !== EstadoTurno.ABIERTO) {
    throw new HttpError(400, 'Este turno ya está cerrado');
  }

  const usuarioCierre = await resolverUsuario(usuarioId);
  turno.usuarioCierre = usuarioCierre;
  turno.notaCierre = dto.nota ?? null;
  turno.estado = EstadoTurno.CERRADO;
  turno.fechaCierre = new Date();
  await turnoRepository.save(turno);

  return obtenerTurno(id);
}
