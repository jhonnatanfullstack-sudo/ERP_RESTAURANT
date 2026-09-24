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
import { RefreshToken } from './refresh-token.entity';
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

/**
 * H06 — Antes de leer o tocar `refresh_tokens`, se bloquea la fila del USUARIO
 * (`SELECT ... FOR UPDATE`, `pessimistic_write`) con el mismo lock, sobre la misma fila y en el
 * mismo orden que usa `cambiarPassword`. Postgres serializa así ambas operaciones del mismo
 * usuario sin importar cuál llegó primero — sin este lock, un refresh que ya había leído "no
 * revocado" antes de que un cambio de contraseña concurrente terminara podía seguir adelante y
 * emitir una sesión nueva que sobrevivía a la revocación (la carrera que llevó a rechazar un
 * simple `UPDATE` sin más como solución de H06).
 *
 * Sin `relations` en la consulta bloqueada: Postgres rechaza `FOR UPDATE` combinado con un
 * `LEFT JOIN` ("cannot be applied to the nullable side of an outer join") — mismo motivo por
 * el que `talonario.service.ts::reservarNumero` separa el `findOne` bloqueado de la carga de
 * relaciones. Bypass de RLS por la misma razón que antes: todavía no se sabe la empresa hasta
 * identificar al usuario del token.
 *
 * No se bloquea nada en `login()`: no hay ningún refresh previo con el que pueda chocar — la
 * carrera de H06 es siempre "un refresh existente contra un cambio de contraseña", nunca contra
 * un login nuevo.
 */
export async function refrescarSesion(refreshTokenRaw: string): Promise<SesionEmitida> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenRaw);
  } catch {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }

  const usuarioBloqueado = await conBypassRls(() =>
    usuarioRepository.findOne({
      where: { id: payload.sub },
      lock: { mode: 'pessimistic_write' },
    }),
  );
  if (!usuarioBloqueado || !usuarioBloqueado.activo) {
    throw new HttpError(401, 'Sesión inválida o expirada');
  }

  // Revalidación DESPUÉS de obtener el lock: es la única lectura de `refresh_tokens` de toda
  // la función. Si un cambio de contraseña concurrente ganó la carrera por la fila y ya revocó
  // este token (o cualquiera del usuario) antes de que este refresh consiguiera el lock, acá
  // se ve exactamente ese estado ya confirmado — nunca uno leído antes de esperar.
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

  if (!usuarioActual || !usuarioActual.personal.empresa.activo) {
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

/**
 * H06 — Cambiar la contraseña revoca TODAS las sesiones (refresh tokens) previas del usuario,
 * no solo la de la petición actual: quien cambia la contraseña por sospecha de robo de sesión
 * necesita cerrar cualquier otro dispositivo, no únicamente el suyo (eso ya lo hace `logout`,
 * que es una operación distinta y no se toca acá).
 *
 * `.setLock('pessimistic_write')` bloquea la fila del usuario (`SELECT ... FOR UPDATE`) con el
 * mismo lock, misma fila y mismo orden que usa `refrescarSesion` — ver el comentario grande de
 * esa función para el análisis completo de la carrera que esto cierra. El lock se mantiene
 * hasta que termina la transacción de esta petición (`tenant.middleware.ts` confirma al final),
 * así que todo lo que sigue —hashear, guardar, revocar— ocurre "protegido" frente a cualquier
 * refresh concurrente del mismo usuario.
 *
 * Lo que NO hace: no invalida el access token ya emitido (JWT stateless, sigue vivo hasta su
 * expiración natural — `JWT_ACCESS_EXPIRES_IN`, ~15 min por defecto). Revocar access tokens de
 * inmediato exigiría una lista de revocación stateless-a-stateful distinta; queda fuera de H06.
 */
export async function cambiarPassword(usuarioId: string, dto: CambiarPasswordDto): Promise<void> {
  const usuario = await usuarioRepository
    .createQueryBuilder('usuario')
    .addSelect('usuario.passwordHash')
    .setLock('pessimistic_write')
    .where('usuario.id = :id', { id: usuarioId })
    .getOne();

  if (!usuario) {
    throw new HttpError(404, 'Usuario no encontrado');
  }

  const passwordValida = await bcrypt.compare(dto.passwordActual, usuario.passwordHash);
  if (!passwordValida) {
    // Se lanza antes de tocar `usuario`: si la contraseña actual es incorrecta,
    // `debeCambiarPassword` (H01) queda exactamente como estaba, nunca se limpia.
    throw new HttpError(401, 'La contraseña actual es incorrecta');
  }

  // H01-R01: comparar contra el HASH guardado con bcrypt.compare, nunca la contraseña actual
  // en texto plano contra la nueva en texto plano — dos contraseñas iguales no producen el
  // mismo hash (la sal es aleatoria), así que la única comparación válida es esta. Sin este
  // chequeo, "cambiar" la contraseña a la misma que ya tenía limpiaría `debeCambiarPassword`
  // sin que la cuenta hubiera rotado nada de verdad.
  const esLaMisma = await bcrypt.compare(dto.passwordNuevo, usuario.passwordHash);
  if (esLaMisma) {
    throw new HttpError(400, 'La nueva contraseña debe ser diferente de la actual');
  }

  usuario.passwordHash = await bcrypt.hash(dto.passwordNuevo, 12);
  // Un solo `UPDATE` para ambas columnas: la petición ya corre dentro de una única
  // transacción por request (`tenant.middleware.ts`), así que esto es atómico con todo lo
  // demás que haga esta operación.
  usuario.debeCambiarPassword = false;
  await usuarioRepository.save(usuario);

  // Revocación total: cualquier refresh token no revocado de este usuario, sin importar en qué
  // dispositivo/sesión se emitió. Sigue dentro de la misma transacción de la petición (el lock
  // de arriba la mantiene protegida hasta el commit) — un `UPDATE` masivo es idempotente y no
  // necesita distinguir cuál fila es "la actual": el criterio de aceptación de H06 es revocar
  // TODAS, sin excepción.
  await refreshTokenRepository
    .createQueryBuilder()
    .update(RefreshToken)
    .set({ revocado: true })
    .where('usuario_id = :usuarioId AND revocado = false', { usuarioId })
    .execute();
}
