import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { Server as HttpServer } from 'node:http';

let io: SocketIOServer | null = null;

function salaEmpresa(empresaId: string): string {
  return `empresa:${empresaId}`;
}

/**
 * Inicializa Socket.IO sobre el mismo servidor HTTP de Express (`server.ts`), para no abrir un
 * segundo puerto ni duplicar la configuración de CORS.
 *
 * La autenticación reutiliza el access token de siempre (`verifyAccessToken`): el cliente lo
 * manda en `socket.handshake.auth.token` en vez de una cabecera `Authorization`, porque el
 * protocolo de conexión de Socket.IO no lleva cabeceras HTTP normales una vez que sube a
 * WebSocket. No hay contexto de tenant (`tenant-context.ts`) para los sockets: no hacen
 * consultas a la base de datos, solo reciben eventos ya resueltos por el HTTP normal, así que
 * basta con la empresa del token para decidir a qué sala unirse.
 */
export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.nodeEnv === 'development' ? /^http:\/\/localhost:\d+$/ : env.corsOrigin,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next(new Error('No autenticado'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.empresaId = payload.empresaId;
      next();
    } catch {
      next(new Error('Token inválido o expirado'));
    }
  });

  io.on('connection', (socket) => {
    const empresaId = socket.data.empresaId as string;
    void socket.join(salaEmpresa(empresaId));
  });

  logger.info('Servidor de WebSockets iniciado');
  return io;
}

/**
 * Difunde un evento a todos los clientes conectados de una empresa (todas las pantallas de
 * cocina, comandas, etc. de ese restaurante).
 *
 * Si el servidor de sockets no está inicializado (pruebas que no lo levantan, o un entorno
 * donde todavía no arrancó) no hace nada: el flujo HTTP normal —que es el que persiste los
 * datos— no depende de esto para funcionar. El realtime es una mejora de experiencia, nunca
 * la fuente de verdad.
 */
export function emitirAEmpresa(empresaId: string, evento: string, payload: unknown): void {
  io?.to(salaEmpresa(empresaId)).emit(evento, payload);
}
