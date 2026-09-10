import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { HttpError } from '../../utils/http-error';
import { rangoReporteSchema } from './reporte.dto';
import * as reporteService from './reporte.service';

export async function obtener(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validacion = rangoReporteSchema.safeParse(req.query);
    if (!validacion.success) {
      throw new HttpError(
        400,
        'Rango de fechas inválido',
        validacion.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      );
    }
    sendSuccess(res, await reporteService.obtenerReporte(validacion.data));
  } catch (error) {
    next(error);
  }
}
