import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { HttpError } from '../../utils/http-error';
import * as configuracionService from './configuracion.service';
import type { MedioQrPago } from './configuracion.service';

export async function obtener(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await configuracionService.obtenerConfiguracion());
  } catch (error) {
    next(error);
  }
}

export async function actualizar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const configuracion = await configuracionService.actualizarConfiguracion(req.body);
    sendSuccess(res, configuracion, 'Configuración actualizada');
  } catch (error) {
    next(error);
  }
}

export async function subirQrPago(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      throw new HttpError(400, 'Debe adjuntar una imagen del QR', ['qr es requerida']);
    }
    const medio = req.params.medio as MedioQrPago;
    const configuracion = await configuracionService.actualizarQrPago(medio, req.file);
    sendSuccess(res, configuracion, 'QR de cobro actualizado');
  } catch (error) {
    next(error);
  }
}
