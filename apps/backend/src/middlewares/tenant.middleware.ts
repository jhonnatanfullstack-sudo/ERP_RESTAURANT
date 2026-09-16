import { AppDataSource } from '../database/data-source';
import { ejecutarEnContexto } from '../database/tenant-context';
import { logger } from '../utils/logger';
import type { ContextoTenant } from '../database/tenant-context';
import type { NextFunction, Request, Response } from 'express';

/** Un error al cerrar la transacción no puede tumbar el proceso: la respuesta ya salió. */
function registrarFallo(accion: string, error: unknown): void {
  logger.error(`No se pudo ${accion} la transacción de la petición`, error);
}

/**
 * Abre una transacción por petición y la deja en el contexto multi-empresa.
 *
 * Toda la petición corre dentro de una única transacción por una razón concreta: el
 * aislamiento entre empresas se apoya en `app.empresa_id`, que se fija con `set_config(...,
 * true)` — es decir, **local a la transacción**. Con el pool de conexiones de TypeORM, dos
 * consultas de la misma petición pueden tocar conexiones distintas; si el ajuste no viviera
 * en una transacción compartida, una de ellas correría sin empresa fijada y las políticas
 * RLS la dejarían sin ver nada (o, peor, un `SET` de sesión se quedaría pegado en la
 * conexión y la siguiente petición vería los datos de otra empresa).
 *
 * Que la transacción abarque toda la petición tiene además un efecto deseable: una escritura
 * de varios pasos que falla a la mitad (ej. emitir una venta) ya no deja el resultado
 * incompleto.
 *
 * **La transacción se confirma ANTES de enviar la respuesta**, interceptando `res.end`. La
 * primera versión confirmaba en el evento `finish`, es decir después de que la respuesta ya
 * había salido, y eso produjo una carrera real y reproducible: el alta de una cuenta de
 * prueba respondía 201, el cliente disparaba de inmediato la siguiente petición con su token
 * nuevo, y esa petición abría otra transacción que **todavía no veía la empresa recién
 * creada** — el servidor contestaba "La empresa está inactiva" a una empresa que sí existía.
 * Una respuesta solo puede prometer lo que ya es durable.
 *
 * La empresa **no** se fija acá: en este punto la petición todavía no se autenticó. La fija
 * `requireAuth` cuando ya sabe de quién es el token, o el resolvedor público de la carta a
 * partir del slug del restaurante. Hasta entonces el contexto queda sin empresa y las
 * políticas RLS no dejan leer nada — fallar cerrado es el comportamiento correcto.
 */
export function transaccionPorPeticionMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  void (async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    } catch (error) {
      await queryRunner.release().catch(() => undefined);
      next(error);
      return;
    }

    const contexto: ContextoTenant = {
      empresaId: null,
      manager: queryRunner.manager,
      queryRunner,
      pendientesTrasConfirmar: [],
    };

    let cerrada = false;
    async function cerrar(exitosa: boolean): Promise<void> {
      if (cerrada) return;
      cerrada = true;
      let confirmada = false;
      try {
        if (queryRunner.isTransactionActive) {
          if (exitosa) {
            await queryRunner.commitTransaction();
            confirmada = true;
          } else {
            await queryRunner.rollbackTransaction();
          }
        }
      } catch (error) {
        registrarFallo(exitosa ? 'confirmar' : 'revertir', error);
      } finally {
        await queryRunner.release().catch((error) => registrarFallo('liberar', error));
      }

      // Recién acá es seguro avisar por WebSocket u otro canal en vivo: lo que se guardó ya
      // es durable, no algo que un rollback pudiera hacer desaparecer. Ver
      // `tenant-context.ts: alConfirmar`. Un fallo en una notificación individual no debe
      // impedir que corran las demás ni afectar la respuesta, que ya está en camino.
      if (confirmada) {
        for (const pendiente of contexto.pendientesTrasConfirmar) {
          try {
            pendiente();
          } catch (error) {
            registrarFallo('ejecutar una notificación en vivo tras', error);
          }
        }
      }
    }

    // Se retrasa el envío hasta que la transacción esté confirmada. Una respuesta de error
    // (>= 400) revierte: un 500 a mitad de una escritura no debe dejar media operación
    // grabada.
    const enviarOriginal = res.end.bind(res) as (...args: unknown[]) => Response;
    res.end = function interceptada(...args: unknown[]): Response {
      if (cerrada) return enviarOriginal(...args);
      void cerrar(res.statusCode < 400).then(() => enviarOriginal(...args));
      return res;
    } as typeof res.end;

    // Cliente que corta antes de recibir la respuesta: `res.end` nunca se llama, así que la
    // transacción quedaría abierta reteniendo una conexión del pool.
    res.on('close', () => void cerrar(false));

    ejecutarEnContexto(contexto, next);
  })();
}
