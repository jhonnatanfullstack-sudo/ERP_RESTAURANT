import type { AccessTokenPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      usuarioAuth?: AccessTokenPayload;
    }
  }
}

export {};
