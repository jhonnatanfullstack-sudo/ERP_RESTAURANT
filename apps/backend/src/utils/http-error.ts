export class HttpError extends Error {
  readonly statusCode: number;
  readonly details: string[];
  /** Discriminador estable para que el frontend distinga el motivo sin parsear el mensaje
   * (ej. `DEBE_CAMBIAR_PASSWORD`). Opcional: la mayoría de errores no lo necesitan. */
  readonly codigo?: string;

  constructor(statusCode: number, message: string, details: string[] = [], codigo?: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
    this.codigo = codigo;
  }
}
