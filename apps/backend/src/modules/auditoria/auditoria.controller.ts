import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { HttpError } from '../../utils/http-error';
import { consultaAuditoriaSchema } from './auditoria.dto';
import * as auditoriaService from './auditoria.service';

export async function listar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validacion = consultaAuditoriaSchema.safeParse(req.query);
    if (!validacion.success) {
      throw new HttpError(
        400,
        'Filtros de auditoría inválidos',
        validacion.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    sendSuccess(res, await auditoriaService.listarAuditoria(validacion.data));
  } catch (error) {
    next(error);
  }
}

export async function modulos(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await auditoriaService.listarModulosAuditados());
  } catch (error) {
    next(error);
  }
}
