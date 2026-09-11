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
import { conBypassRls, establecerEmpresaDeLaPeticion } from '../../database/tenant-context';
import type { LoginDto, CambiarPasswordDto } from './auth.dto';

interface SesionEmitida {
  accessToken: string;
  refreshToken: string;
  usuario: ReturnType<typeof usuarioPublico>;
}

/** Emite el par de tokens y graba el refresh. Exportada porque el alta de una demo inicia
 * sesión de una vez: hacer que el usuario se registre y acto seguido tenga que escribir de
 * nuevo su contraseña sería fricción gratuita justo en el momento más frágil del embudo. */
export async function emitirSesion(
  usuarioId: string,
  empresaId: string,
  rolNombre: string,
  permisos: string[],
) {
  const accessToken = signAccessToken({ sub: usuarioId, empresaId, rol: rolNombre, permisos });

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

/**
 * El login es el único punto donde hace falta consultar sin saber la empresa: el usuario
 * escribe solo su correo, y a qué empresa pertenece es precisamente lo que hay que
 * averiguar. De ahí el bypass explícito de RLS, acotado a esa consulta — apenas se resuelve
 * el usuario, se fija la empresa de la petición y el resto vuelve a estar aislado.
 */
export async function login(dto: LoginDto): Promise<SesionEmitida> {
  const usuario = await conBypassRls(() => obtenerUsuarioParaLogin(dto.email));
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

  const empresa = usuario.personal.empresa;
  if (!empresa.activo) {
    throw new HttpError(403, 'La empresa está inactiva');
  }

  // A partir de acá la petición ya tiene empresa: las políticas RLS vuelven a aplicar y el
  // refresh token se graba dentro del aislamiento normal.
  await establecerEmpresaDeLaPeticion(empresa.id);

  const permisos = usuario.rol.permisos?.map((permiso) => permiso.codigo) ?? [];
  const { accessToken, refreshToken } = await emitirSesion(
    usuario.id,
    empresa.id,
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

  // Igual que el login: todavía no se sabe de qué empresa es el token que se está
  // renovando. La cookie de refresco no dice a qué empresa pertenece, y no debería.
  const usuarioActual = await conBypassRls(() =>
    usuarioRepository.findOne({
      where: { id: payload.sub },
      relations: { personal: { empresa: true }, rol: { permisos: true } },
    }),
  );

  if (!usuarioActual || !usuarioActual.activo || !usuarioActual.personal.empresa.activo) {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }

  await establecerEmpresaDeLaPeticion(usuarioActual.personal.empresa.id);

  registro.revocado = true;
  await refreshTokenRepository.save(registro);

  const permisos = usuarioActual.rol.permisos?.map((permiso) => permiso.codigo) ?? [];
  const { accessToken, refreshToken } = await emitirSesion(
    usuarioActual.id,
    usuarioActual.personal.empresa.id,
    usuarioActual.rol.nombre,
    permisos,
  );

  return { accessToken, refreshToken, usuario: usuarioPublico(usuarioActual) };
}

export async function logout(refreshTokenRaw: string): Promise<void> {
  // `refresh_tokens` no está bajo RLS (ver la migración de RLS): se busca por el hash del
  // token, que es un secreto, no un identificador adivinable.
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
