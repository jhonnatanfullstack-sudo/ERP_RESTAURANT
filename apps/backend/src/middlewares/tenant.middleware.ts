import { AppDataSource } from '../database/data-source';
import { ejecutarEnContexto } from '../database/tenant-context';
import { logger } from '../utils/logger';
import { sendError } from '../utils/api-response';
import type { ContextoTenant } from '../database/tenant-context';
import type { NextFunction, Request, Response } from 'express';

/** Un error al cerrar la transacción no puede tumbar el proceso: la respuesta ya salió. */
function registrarFallo(accion: string, error: unknown): void {
  logger.error(`No se pudo ${accion} la transacción de la petición`, error);
}

/**
 * Quita, de una respuesta que iba a ser de éxito, los headers que describían ESE cuerpo antes
 * de sustituirlo por un error genérico (H09). `Content-Type`/`Content-Length` no hace falta
 * tocarlos acá: el `res.send()` de `sendError` los recalcula y sobrescribe siempre. Estos
 * otros no se recalculan solos si ya existían:
 *
 * - `ETag`: `express/lib/response.js` solo genera uno nuevo si el header **no** está puesto
 *   todavía (`!this.get('ETag')`) — el de la respuesta de éxito abortada sobreviviría intacto,
 *   describiendo un cuerpo que nunca se envió.
 * - `Location` / `Content-Disposition` / `Last-Modified`: nadie los vuelve a tocar si ya
 *   estaban. Verificado que hoy ningún controlador de este backend los usa (`grep` sin
 *   resultados) — se limpian de todas formas porque son, por RFC 7231, headers ligados a la
 *   entidad/payload específico de una respuesta, no transversales, y dejarlos sin cubrir sería
 *   una omisión sobre una superficie que sí puede aparecer en el futuro.
 * - `Set-Cookie` (la cookie de sesión, `REFRESH_COOKIE`): el único `res.cookie(...)` que
 *   existe hoy en el backend (`login`, `refrescar`, alta de demo) promete una sesión que, si
 *   el commit falló, nunca quedó persistida en `refresh_tokens`. Se elimina el header por
 *   completo (`removeHeader`), no con `res.clearCookie(...)`: `res.cookie()`/`clearCookie()`
 *   **agregan** al array de `Set-Cookie` en vez de reemplazarlo (HTTP permite varias cookies
 *   por respuesta), así que llamar a `clearCookie` acá dejaría *ambas* — la de éxito
 *   original y la de borrado — en la respuesta final. Como esta respuesta nunca llegó a
 *   salir (`res.headersSent` sigue en `false`), no hace falta instruir al navegador a
 *   "borrar" nada: alcanza con que el `Set-Cookie` de la respuesta de error no exista.
 *
 * Deliberadamente NO se tocan los headers transversales (`x-request-id` de
 * `peticion.middleware.ts`, los de `helmet()`, los de `cors()`): ninguno depende del cuerpo
 * específico de esta respuesta, y esta función no los toca en absoluto.
 */
function limpiarHeadersDeExito(res: Response): void {
  res.removeHeader('ETag');
  res.removeHeader('Location');
  res.removeHeader('Content-Disposition');
  res.removeHeader('Last-Modified');
  res.removeHeader('Set-Cookie');
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
 *
 * **Si el COMMIT falla, la respuesta de éxito ya armada se descarta.** `cerrar()` informa si
 * la transacción quedó realmente confirmada; `interceptada` la usa para decidir qué mandar.
 * Esto es seguro porque, en el momento en que se toma esa decisión, todavía no salió ni un
 * byte al cliente: ni `res.status` ni `res.set` ni `res.json` tocan el socket — solo esta
 * misma función lo hace, y recién cuando decide hacerlo.
 */
export function transaccionPorPeticionMiddleware(
  req: Request,
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

    // Tres estados explícitos, no un solo booleano: "ya arrancó un cierre" (ABIERTO→CERRANDO)
    // y "ya es seguro enviar bytes" son preguntas DISTINTAS. Antes se contestaban con el mismo
    // flag (`cerrada`), y eso permitía que una segunda llamada a `res.end()` —mientras el
    // COMMIT de la primera todavía estaba pendiente— tomara el atajo de "ya está cerrada" y
    // mandara sus propios bytes sin esperar el resultado real del commit. `estado` gobierna
    // exclusivamente si corresponde arrancar (o reutilizar) el cierre transaccional;
    // `autorizadoParaEnviar` gobierna, por separado, si ESTA llamada puntual a `res.end()` es
    // la única autorizada a tocar el socket de verdad.
    type EstadoCierre = 'ABIERTO' | 'CERRANDO' | 'CERRADO';
    let estado: EstadoCierre = 'ABIERTO';
    let cierre: Promise<boolean> | null = null;
    let autorizadoParaEnviar = false;

    /** Devuelve si la transacción quedó realmente CONFIRMADA (no si "se intentó confirmar").
     * Como máximo un commit/rollback real por petición: si ya hay un cierre en curso o
     * terminado (disparado por `interceptada` o por `res.on('close')`, lo que llegue primero),
     * cualquier otra llamada recibe la MISMA promesa en vez de repetir el intento. */
    function cerrar(exitosa: boolean): Promise<boolean> {
      if (estado !== 'ABIERTO') return cierre ?? Promise.resolve(false);
      estado = 'CERRANDO';
      cierre = (async () => {
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
          // El COMMIT falló pero la conexión puede seguir viva con la transacción abortada en
          // el servidor (Postgres aborta la transacción ante cualquier error ocurrido dentro
          // de ella). Sin este ROLLBACK de recuperación, `release()` (más abajo) devolvería
          // esa conexión al pool todavía "atascada" — la siguiente petición, de cualquier
          // empresa, que la reutilizara fallaría con un error de Postgres sin relación
          // aparente con lo que causó el problema original. No se asume que este rollback
          // vaya a tener éxito: si la conexión en sí murió, también fallará, y queda
          // registrado aparte — nunca se afirma una reversión que no se pudo confirmar. Esto
          // NO cubre todos los casos: si PostgreSQL ya había resuelto el `COMMIT` como un
          // `ROLLBACK` silencioso sobre una transacción previamente abortada por una consulta
          // anterior, `commitTransaction()` ni siquiera llega a lanzar (TypeORM no inspecciona
          // el "command tag" de la respuesta) — ese caso queda fuera del alcance de H09 (ver
          // informe de la sesión anterior).
          if (exitosa && queryRunner.isTransactionActive) {
            try {
              await queryRunner.rollbackTransaction();
            } catch (errorRecuperacion) {
              registrarFallo('revertir tras un commit fallido', errorRecuperacion);
            }
          }
        } finally {
          await queryRunner.release().catch((error) => registrarFallo('liberar', error));
          estado = 'CERRADO';
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
        return confirmada;
      })();
      return cierre;
    }

    // Se retrasa el envío hasta que la transacción esté confirmada. Una respuesta de error
    // (>= 400) revierte: un 500 a mitad de una escritura no debe dejar media operación
    // grabada. Si la respuesta iba a ser de éxito pero el COMMIT termina fallando, el body ya
    // armado en `args` se descarta por completo y se sustituye por un error genérico (H09) —
    // seguro precisamente porque, hasta este punto, no salió ningún byte al cliente.
    const enviarOriginal = res.end.bind(res) as (...args: unknown[]) => Response;
    res.end = function interceptada(...args: unknown[]): Response {
      // Única llamada autorizada a tocar el socket de verdad: la dispara el propio código de
      // más abajo (directamente, o indirectamente vía `sendError` → `res.json` → `res.end`,
      // que reentra acá). Se consume de inmediato (un solo uso) para que ninguna llamada
      // posterior — legítima o no — pueda reenviar nada.
      if (autorizadoParaEnviar) {
        autorizadoParaEnviar = false;
        return enviarOriginal(...args);
      }
      // Cualquier llamada mientras ya hay un cierre en curso o terminado (disparado por ESTA
      // misma función en una invocación anterior, o por `res.on('close')`) no es la
      // autorizada: no arranca un segundo commit/rollback, no decide de nuevo qué responder,
      // y sobre todo — a diferencia del código anterior — NO manda bytes por su cuenta. Si el
      // cierre todavía está en curso (COMMIT pendiente), esta llamada simplemente no hace
      // nada: la respuesta real la termina de resolver la primera llamada, cuando su propio
      // `cerrar(...)` se resuelva.
      if (estado !== 'ABIERTO') return res;

      const eraExitosa = res.statusCode < 400;
      const argsOriginales = args;
      cerrar(eraExitosa)
        .then((confirmada) => {
          if (eraExitosa && !confirmada) {
            // `sendError` reentra en `interceptada` vía `res.json` → `res.end`: el permiso se
            // otorga acá y esa reentrada lo consume de inmediato (un solo uso). Nunca se
            // exponen detalles de Postgres: mismo mensaje genérico que usa
            // `error-handler.middleware.ts`.
            autorizadoParaEnviar = true;
            limpiarHeadersDeExito(res);
            sendError(
              res,
              500,
              'Error interno del servidor',
              req.idTraza ? [`Referencia: ${req.idTraza}`] : [],
            );
            return;
          }
          // Envío directo del éxito original (no vía `res.end(...)`, para no pelear con el
          // tipado de los overloads de Express contra `unknown[]`) — no hace falta pasar por
          // el permiso: es la única llamada que puede llegar acá para esta petición.
          enviarOriginal(...argsOriginales);
        })
        .catch((error: unknown) => {
          // `cerrar()` nunca rechaza (atrapa todo internamente) — esto solo puede venir de
          // `limpiarHeadersDeExito`/`sendError`/`res.end` mismos. Sin este `.catch()` sería
          // una Promise rechazada sin manejar.
          registrarFallo('enviar la respuesta tras cerrar la transacción', error);
          if (res.headersSent) {
            // Ya salieron bytes reales (probablemente durante el intento que acaba de fallar):
            // intentar un segundo cuerpo sería una respuesta corrupta, no una corrección.
            return;
          }
          try {
            autorizadoParaEnviar = true;
            limpiarHeadersDeExito(res);
            sendError(res, 500, 'Error interno del servidor');
          } catch (errorEnvio) {
            registrarFallo('enviar la respuesta de error de emergencia tras', errorEnvio);
          }
        });
      return res;
    } as typeof res.end;

    // Cliente que corta antes de recibir la respuesta: `res.end` nunca se llama, así que la
    // transacción quedaría abierta reteniendo una conexión del pool.
    res.on('close', () => {
      cerrar(false).catch((error: unknown) =>
        registrarFallo('cerrar tras que el cliente cortara la conexión', error),
      );
    });

    ejecutarEnContexto(contexto, next);
  })();
}
