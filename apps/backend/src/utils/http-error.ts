export class HttpError extends Error {
  readonly statusCode: number;
  readonly details: string[];

  constructor(statusCode: number, message: string, details: string[] = []) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
