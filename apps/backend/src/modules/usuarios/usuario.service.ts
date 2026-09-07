import bcrypt from 'bcrypt';
import { HttpError } from '../../utils/http-error';
import { personalRepository } from '../personal/personal.repository';
import { rolRepository } from '../roles/rol.repository';
import { usuarioRepository } from './usuario.repository';
import type { ActualizarUsuarioDto, CrearUsuarioDto } from './usuario.dto';
import type { Usuario } from './usuario.entity';

const SALT_ROUNDS = 12;
const RELACIONES = { personal: true, rol: { permisos: true } } as const;

export async function listarUsuarios(): Promise<Usuario[]> {
  return usuarioRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
}

export async function obtenerUsuario(id: string): Promise<Usuario> {
  const usuario = await usuarioRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!usuario) {
    throw new HttpError(404, 'Usuario no encontrado');
  }
  return usuario;
}

export async function obtenerUsuarioParaLogin(email: string): Promise<Usuario | null> {
  return usuarioRepository
    .createQueryBuilder('usuario')
    .addSelect('usuario.passwordHash')
    .leftJoinAndSelect('usuario.personal', 'personal')
    .leftJoinAndSelect('usuario.rol', 'rol')
    .leftJoinAndSelect('rol.permisos', 'permisos')
    .where('usuario.email = :email', { email })
    .getOne();
}

export async function crearUsuario(dto: CrearUsuarioDto): Promise<Usuario> {
  const personal = await personalRepository.findOneBy({ id: dto.personalId });
  if (!personal) {
    throw new HttpError(400, 'El personal indicado no existe', ['personalId inválido']);
  }

  const usuarioExistentePorPersonal = await usuarioRepository.findOneBy({
    personal: { id: dto.personalId },
  });
  if (usuarioExistentePorPersonal) {
    throw new HttpError(409, 'Esa persona ya tiene una cuenta de usuario');
  }

  const rol = await rolRepository.findOneBy({ id: dto.rolId });
  if (!rol) {
    throw new HttpError(400, 'El rol indicado no existe', ['rolId inválido']);
  }

  const emailExistente = await usuarioRepository.findOneBy({ email: dto.email });
  if (emailExistente) {
    throw new HttpError(409, 'Ya existe un usuario con ese correo electrónico');
  }

  const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

  const usuario = usuarioRepository.create({
    personal,
    rol,
    email: dto.email,
    passwordHash,
  });
  const guardado = await usuarioRepository.save(usuario);
  return obtenerUsuario(guardado.id);
}

export async function actualizarUsuario(id: string, dto: ActualizarUsuarioDto): Promise<Usuario> {
  const usuario = await obtenerUsuario(id);

  if (dto.email && dto.email !== usuario.email) {
    const existente = await usuarioRepository.findOneBy({ email: dto.email });
    if (existente) {
      throw new HttpError(409, 'Ya existe un usuario con ese correo electrónico');
    }
    usuario.email = dto.email;
  }

  if (dto.rolId) {
    const rol = await rolRepository.findOneBy({ id: dto.rolId });
    if (!rol) {
      throw new HttpError(400, 'El rol indicado no existe', ['rolId inválido']);
    }
    usuario.rol = rol;
  }

  if (dto.activo !== undefined) {
    usuario.activo = dto.activo;
  }

  await usuarioRepository.save(usuario);
  return obtenerUsuario(id);
}
