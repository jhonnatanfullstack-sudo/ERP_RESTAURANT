import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { env } from '../../config/env';
import { REFRESH_COOKIE, opcionesCookieRefresh } from '../../config/cookies';
import { emitirSesion } from '../auth/auth.service';
import { calcularSuscripcion } from '../suscripcion/suscripcion.service';
import { conBypassRls } from '../../database/tenant-context';
import { tipoDocumentoIdentidadRepository } from '../catalogos/catalogos.repository';
import * as catalogosService from '../catalogos/catalogos.service';
import * as demoService from './demo.service';

export async function registrar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { empresa, usuarioId, rolNombre, permisos } = await demoService.registrarDemo(req.body);
    const { accessToken, refreshToken } = await emitirSesion(
      usuarioId,
      empresa.id,
      rolNombre,
      permisos,
    );

    res.cookie(REFRESH_COOKIE, refreshToken, opcionesCookieRefresh);
    sendSuccess(
      res,
      {
        accessToken,
        empresa: { id: empresa.id, razonSocial: empresa.razonSocial, slug: empresa.slug },
        suscripcion: calcularSuscripcion(empresa),
      },
      `Tu prueba de ${env.demo.diasDePrueba} días está lista`,
      201,
    );
  } catch (error) {
    next(error);
  }
}

/** Información pública de la prueba, para que la página de registro pueda anunciar la
 * duración real sin tenerla escrita a mano en el frontend. */
export function informacion(_req: Request, res: Response): void {
  sendSuccess(res, {
    diasDePrueba: env.demo.diasDePrueba,
    proveedor: {
      nombre: env.proveedor.nombre,
      email: env.proveedor.email,
      telefono: env.proveedor.telefono,
    },
  });
}

/**
 * Tipos de documento de identidad para el formulario de registro. El catálogo general
 * (`/api/catalogos/...`) exige sesión, y quien se está registrando todavía no tiene ninguna.
 * Es un catálogo SUNAT público y de solo lectura, así que exponerlo no revela nada: lo que
 * no se puede es dejar abierto el resto de `/api/catalogos`.
 *
 * Va con bypass porque `catalogos` no está bajo RLS pero la petición aún no tiene empresa;
 * sin él, la consulta correría sin contexto y no hay ninguno que fijar.
 */
export async function tiposDocumento(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const tipos = await conBypassRls(() =>
      tipoDocumentoIdentidadRepository.find({ order: { codigo: 'ASC' } }),
    );
    sendSuccess(res, tipos);
  } catch (error) {
    next(error);
  }
}

/** País y división administrativa (departamento/provincia/distrito) para el formulario de
 * registro — mismo motivo que `tiposDocumento`: `/api/catalogos/...` exige sesión y quien se
 * está registrando todavía no tiene ninguna. */
export async function paises(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await conBypassRls(() => catalogosService.listarPaises()));
  } catch (error) {
    next(error);
  }
}

export async function divisionesAdministrativas(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { paisId, padreId } = req.query as Record<string, string | undefined>;
    if (!paisId) {
      sendSuccess(res, []);
      return;
    }
    sendSuccess(
      res,
      await conBypassRls(() =>
        catalogosService.listarDivisionesAdministrativas({ paisId, padreId: padreId ?? null }),
      ),
    );
  } catch (error) {
    next(error);
  }
}
