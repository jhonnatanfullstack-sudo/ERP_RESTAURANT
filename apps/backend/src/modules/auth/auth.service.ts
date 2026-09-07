import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { HttpError } from '../../utils/http-error';
import { hashToken } from '../../utils/hash-token';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { env } from '../../config/env';
import { obtenerUsuarioParaLogin, obtenerUsuario } from '../usuarios/usuario.service';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { usuarioPublico } from '../usuarios/usuario.mapper';
import { refreshTokenRepository } from './refresh-token.repository';
import type { LoginDto, CambiarPasswordDto } from './auth.dto';

interface SesionEmitida {
  accessToken: string;
  refreshToken: string;
  usuario: ReturnType<typeof usuarioPublico>;
}

async function emitirSesion(usuarioId: string, rolNombre: string, permisos: string[]) {
  const accessToken = signAccessToken({ sub: usuarioId, rol: rolNombre, permisos });

  const tokenId = randomUUID();
  const refreshToken = signRefreshToken({ sub: usuarioId, tokenId });

  await refreshTokenRepository.save(
    refreshTokenRepository.create({
      usuario: { id: usuarioId },
      tokenHash: hashToken(refreshToken),
      expiraEn: new Date(Date.now() + env.jwt.refreshExpiresInMs),
      revocado: false,
    }),
  );

  return { accessToken, refreshToken };
}

export async function login(dto: LoginDto): Promise<SesionEmitida> {
  const usuario = await obtenerUsuarioParaLogin(dto.email);
  if (!usuario) {
    throw new HttpError(401, 'Credenciales inválidas');
  }
  if (!usuario.activo) {
    throw new HttpError(403, 'El usuario está inactivo');
  }

  const passwordValida = await bcrypt.compare(dto.password, usuario.passwordHash);
  if (!passwordValida) {
    throw new HttpError(401, 'Credenciales inválidas');
  }

  const permisos = usuario.rol.permisos?.map((permiso) => permiso.codigo) ?? [];
  const { accessToken, refreshToken } = await emitirSesion(
    usuario.id,
    usuario.rol.nombre,
    permisos,
  );

  return { accessToken, refreshToken, usuario: usuarioPublico(usuario) };
}

export async function refrescarSesion(refreshTokenRaw: string): Promise<SesionEmitida> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenRaw);
  } catch {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }

  const registro = await refreshTokenRepository.findOneBy({
    tokenHash: hashToken(refreshTokenRaw),
  });
  if (!registro || registro.revocado || registro.expiraEn < new Date()) {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }

  registro.revocado = true;
  await refreshTokenRepository.save(registro);

  const usuarioActual = await usuarioRepository.findOne({
    where: { id: payload.sub },
    relations: { personal: true, rol: { permisos: true } },
  });

  if (!usuarioActual || !usuarioActual.activo) {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }

  const permisos = usuarioActual.rol.permisos?.map((permiso) => permiso.codigo) ?? [];
  const { accessToken, refreshToken } = await emitirSesion(
    usuarioActual.id,
    usuarioActual.rol.nombre,
    permisos,
  );

  return { accessToken, refreshToken, usuario: usuarioPublico(usuarioActual) };
}

export async function logout(refreshTokenRaw: string): Promise<void> {
  const registro = await refreshTokenRepository.findOneBy({
    tokenHash: hashToken(refreshTokenRaw),
  });
  if (registro) {
    registro.revocado = true;
    await refreshTokenRepository.save(registro);
  }
}

export async function me(usuarioId: string) {
  const usuario = await obtenerUsuario(usuarioId);
  return usuarioPublico(usuario);
}

export async function cambiarPassword(usuarioId: string, dto: CambiarPasswordDto): Promise<void> {
  const usuario = await usuarioRepository
    .createQueryBuilder('usuario')
    .addSelect('usuario.passwordHash')
    .where('usuario.id = :id', { id: usuarioId })
    .getOne();

  if (!usuario) {
    throw new HttpError(404, 'Usuario no encontrado');
  }

  const passwordValida = await bcrypt.compare(dto.passwordActual, usuario.passwordHash);
  if (!passwordValida) {
    throw new HttpError(401, 'La contraseña actual es incorrecta');
  }

  usuario.passwordHash = await bcrypt.hash(dto.passwordNuevo, 12);
  await usuarioRepository.save(usuario);
}
