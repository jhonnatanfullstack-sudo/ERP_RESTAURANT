import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { getIdParam, getParam } from '../../utils/request-params';
import { HttpError } from '../../utils/http-error';
import * as facturacionService from './facturacion.service';

export async function obtenerConfiguracion(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    sendSuccess(res, await facturacionService.obtenerConfiguracionFacturacion());
  } catch (error) {
    next(error);
  }
}

export async function guardarConfiguracion(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const configuracion = await facturacionService.guardarConfiguracionFacturacion(req.body);
    sendSuccess(res, configuracion, 'Configuración guardada');
  } catch (error) {
    next(error);
  }
}

export async function subirCertificado(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new HttpError(400, 'Debe adjuntar el archivo .pfx/.p12', ['certificado es requerido']);
    }
    const contrasena = typeof req.body.contrasena === 'string' ? req.body.contrasena : '';
    if (!contrasena) {
      throw new HttpError(400, 'Debe indicar la contraseña del certificado', [
        'contrasena es requerida',
      ]);
    }
    const configuracion = await facturacionService.guardarCertificadoFacturacion(
      req.file.buffer,
      contrasena,
    );
    sendSuccess(res, configuracion, 'Certificado guardado');
  } catch (error) {
    next(error);
  }
}

export async function obtenerComprobanteDeVenta(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const comprobante = await facturacionService.obtenerComprobanteDeVenta(
      getParam(req, 'ventaId'),
    );
    sendSuccess(res, comprobante);
  } catch (error) {
    next(error);
  }
}

export async function emitir(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comprobante = await facturacionService.emitirComprobante(getParam(req, 'ventaId'));
    sendSuccess(res, comprobante, 'Comprobante emitido');
  } catch (error) {
    next(error);
  }
}

export async function reintentar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const comprobante = await facturacionService.reintentarEnvio(getIdParam(req));
    sendSuccess(res, comprobante, 'Comprobante reenviado');
  } catch (error) {
    next(error);
  }
}
