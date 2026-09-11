import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { HttpError } from '../../utils/http-error';
import {
  REFRESH_COOKIE,
  opcionesBorrarCookieRefresh,
  opcionesCookieRefresh,
} from '../../config/cookies';
import * as authService from './auth.service';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { accessToken, refreshToken, usuario } = await authService.login(req.body);
    res.cookie(REFRESH_COOKIE, refreshToken, opcionesCookieRefresh);
    sendSuccess(res, { accessToken, usuario }, 'Sesión iniciada');
  } catch (error) {
    next(error);
  }
}

export async function refrescar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshTokenRaw = req.cookies?.[REFRESH_COOKIE];
    if (!refreshTokenRaw) {
      throw new HttpError(401, 'No hay sesión activa');
    }
    const { accessToken, refreshToken, usuario } =
      await authService.refrescarSesion(refreshTokenRaw);
    res.cookie(REFRESH_COOKIE, refreshToken, opcionesCookieRefresh);
    sendSuccess(res, { accessToken, usuario }, 'Sesión renovada');
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshTokenRaw = req.cookies?.[REFRESH_COOKIE];
    if (refreshTokenRaw) {
      await authService.logout(refreshTokenRaw);
    }
    res.clearCookie(REFRESH_COOKIE, opcionesBorrarCookieRefresh);
    sendSuccess(res, null, 'Sesión cerrada');
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const usuario = await authService.me(req.usuarioAuth!.sub);
    sendSuccess(res, usuario);
  } catch (error) {
    next(error);
  }
}

export async function cambiarPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authService.cambiarPassword(req.usuarioAuth!.sub, req.body);
    sendSuccess(res, null, 'Contraseña actualizada');
  } catch (error) {
    next(error);
  }
}
