import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppDataSource } from '../database/data-source';
import { Usuario } from '../modules/usuarios/usuario.entity';
import type { Server as HttpServer } from 'node:http';

let io: SocketIOServer | null = null;

function salaEmpresa(empresaId: string): string {
  return `empresa:${empresaId}`;
}

/**
 * Verifica en la base si el usuario del token todavía puede conectarse. **Nunca lanza**: un
 * fallo de negocio (no existe, inactivo, rotación pendiente) y un fallo operativo (la consulta
 * a Postgres falla) se tratan igual desde afuera — los dos terminan en "no, rechazar la
 * conexión" — porque un handshake de Socket.IO no tiene a quién devolverle un 500 con detalle:
 * solo puede aceptar o rechazar.
 *
 * H01-R12 (revisión Codex): la versión anterior hacía `createQueryRunner()` / `connect()` /
 * `startTransaction()` **antes** de entrar al `try`, dentro de una función async llamada con
 * `void (...)()` — si cualquiera de esas tres operaciones fallaba (ej. el pool de conexiones
 * agotado, un corte de red hacia Postgres), la promesa rechazada no tenía ningún `.catch()`
 * esperándola: `unhandledRejection`, capaz de tumbar el proceso, y el handshake se quedaba sin
 * llamar a `next()` ni a favor ni en contra. Acá las tres quedan DENTRO del `try`, y quien
 * llama a esta función (`io.use()` más abajo) encadena su propio `.catch()` como red de
 * seguridad final — aunque esta función esté diseñada para no necesitarlo nunca.
 *
 * `conectado`/`transaccionIniciada` se rastrean explícitos para que un `rollback`/`release`
 * nunca se intente sobre un `queryRunner` que no llegó a ese punto (evita un segundo error
 * encima del primero) y para que un fallo DURANTE el `rollback` o el `release` quede solo
 * registrado — nunca sustituye al error original ni genera su propio rechazo sin manejar.
 */
async function usuarioPuedeConectar(payload: {
  sub: string;
  empresaId: string;
}): Promise<boolean> {
  let queryRunner: ReturnType<typeof AppDataSource.createQueryRunner> | undefined;
  let conectado = false;
  let transaccionIniciada = false;

  try {
    queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    conectado = true;
    await queryRunner.startTransaction();
    transaccionIniciada = true;

    // Local a esta transacción: fija a qué empresa pertenece la consulta, igual que
    // `establecerEmpresaDeLaPeticion` hace para una petición HTTP normal — si el usuario no
    // perteneciera de verdad a `payload.empresaId`, RLS lo dejaría sin encontrar nada. Sin
    // bypass: esto lee con el aislamiento normal, no lo salta.
    await queryRunner.query(`SELECT set_config('app.empresa_id', $1, true)`, [payload.empresaId]);
    const usuario = await queryRunner.manager.getRepository(Usuario).findOne({
      where: { id: payload.sub },
      select: { id: true, activo: true, debeCambiarPassword: true },
    });

    await queryRunner.commitTransaction();
    transaccionIniciada = false;

    if (!usuario) {
      return false;
    }
    return usuario.activo && !usuario.debeCambiarPassword;
  } catch (error) {
    if (transaccionIniciada && queryRunner) {
      try {
        await queryRunner.rollbackTransaction();
      } catch (errorDeRollback) {
        logger.error('No se pudo revertir la transacción al verificar un socket', errorDeRollback);
      }
    }
    // Nunca se le devuelve al cliente el mensaje real (podría filtrar detalle de Postgres) — la
    // llamante siempre traduce esto a un rechazo genérico del handshake.
    logger.error('No se pudo verificar el usuario al conectar el socket', error);
    return false;
  } finally {
    if (conectado && queryRunner) {
      try {
        await queryRunner.release();
      } catch (errorDeRelease) {
        logger.error('No se pudo liberar la conexión al verificar un socket', errorDeRelease);
      }
    }
  }
}

/**
 * Inicializa Socket.IO sobre el mismo servidor HTTP de Express (`server.ts`), para no abrir un
 * segundo puerto ni duplicar la configuración de CORS.
 *
 * La autenticación reutiliza el access token de siempre (`verifyAccessToken`): el cliente lo
 * manda en `socket.handshake.auth.token` en vez de una cabecera `Authorization`, porque el
 * protocolo de conexión de Socket.IO no lleva cabeceras HTTP normales una vez que sube a
 * WebSocket.
 *
 * H01-R02: que el JWT sea válido no basta. El token puede seguir siendo válido (hasta 15 min
 * por defecto) después de que un administrador desactive al usuario o de que quede con una
 * rotación de contraseña pendiente (`debe_cambiar_password`, ver `middlewares/auth.middleware.ts`
 * — el mismo control que ya se aplica a cada petición HTTP). Por eso el handshake abre su
 * propia transacción corta (no hay contexto de tenant para sockets, así que se fija
 * `app.empresa_id` a mano, igual que un script administrativo) y relee el estado real del
 * usuario en la base antes de aceptar la conexión — nunca confía en una bandera vieja que
 * viajara en el propio token.
 *
 * Límite conocido y aceptado: esta comprobación solo corre al CONECTAR. Un socket ya conectado
 * no se desconecta retroactivamente si el usuario se desactiva o queda con la contraseña
 * pendiente *después* — revocación en vivo de conexiones ya abiertas es un problema distinto
 * (queda para H08, no para H01: el objetivo mínimo acá es impedir *nuevas* conexiones mientras
 * la rotación esté pendiente).
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

    let payload: ReturnType<typeof verifyAccessToken>;
    try {
      payload = verifyAccessToken(token);
    } catch {
      next(new Error('Token inválido o expirado'));
      return;
    }

    if (!payload.empresaId) {
      next(new Error('Sesión desactualizada, vuelve a iniciar sesión'));
      return;
    }

    // `.then()/.catch()` explícitos, no `void (async () => {...})()`: así SIEMPRE hay un
    // manejador de rechazo encadenado a la promesa devuelta por `usuarioPuedeConectar`, sin
    // importar en qué punto fallara — es la red de seguridad final contra un
    // `unhandledRejection` (H01-R12). `usuarioPuedeConectar` en sí ya no debería rechazar
    // nunca (atrapa todo internamente), pero esta cadena no depende de que eso siga siendo
    // cierto para ser segura.
    usuarioPuedeConectar(payload)
      .then((puedeConectar) => {
        if (!puedeConectar) {
          next(new Error('No autenticado'));
          return;
        }
        socket.data.empresaId = payload.empresaId;
        next();
      })
      .catch((error: unknown) => {
        logger.error('Fallo inesperado verificando la sesión de un socket', error);
        next(new Error('No se pudo verificar la sesión'));
      });
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
