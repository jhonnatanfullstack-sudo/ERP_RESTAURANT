import type { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, message = 'OK', statusCode = 200): void {
  res.status(statusCode).json({ success: true, message, data });
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  details: string[] = [],
  codigo?: string,
): void {
  res.status(statusCode).json({ success: false, message, details, ...(codigo ? { codigo } : {}) });
}
