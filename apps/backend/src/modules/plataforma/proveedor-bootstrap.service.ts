import { AppDataSource } from '../../database/data-source';
import { activarBypassRls } from '../../database/bypass-rls';
import { HttpError } from '../../utils/http-error';
import { Usuario } from '../usuarios/usuario.entity';

/**
 * Administra quién es el proveedor de la plataforma (H01, `docs/auditoria/BACKLOG-TECNICO.md`).
 *
 * Es la única vía normal para asignar o quitar `usuarios.es_proveedor` fuera de las
 * migraciones históricas ya neutralizadas (`UsuarioProveedor`, `CorregirMarcaProveedor`,
 * `NeutralizarProveedorSemilla`). La usan tanto `scripts/cli-proveedor.ts` como los tests —
 * deliberadamente independiente de Express (no depende de `requireAuth` ni del contexto de
 * petición de `tenant-context.ts`) porque quien la ejecuta ya tiene el nivel de confianza de
 * quien corre una migración a mano, no el de un usuario autenticado por HTTP.
 *
 * Nunca decide a quién marcar por antigüedad, por `PROVEEDOR_EMAIL` ni por ningún otro criterio
 * implícito: el email siempre lo da explícitamente quien invoca cada función. Como máximo puede
 * haber un proveedor a la vez (sin soporte multi-proveedor, ver H01 MODIFICACIÓN 1).
 */

/**
 * Clave del advisory lock que serializa `asignarProveedor`. Arbitraria pero estable: dos
 * ejecuciones concurrentes (dos operadores, o un script de despliegue reintentado) toman la
 * MISMA clave, así que la segunda espera a que la primera confirme su transacción (el lock es
 * `pg_advisory_xact_lock`, se libera solo al terminarla) antes de volver a contar cuántos
 * proveedores hay — sin esto, ambas podrían leer "cero proveedores" antes de que cualquiera
 * escribiera, y las dos terminarían asignando.
 */
const CLAVE_ADVISORY_LOCK_PROVEEDOR = 780_100_01;

/** Código de Postgres para "violación de restricción única", y el índice que garantiza el
 * invariante a nivel de base (H01-R04, `UnicoProveedorGlobal`). El advisory lock de arriba ya
 * evita que dos llamadas a `asignarProveedor` se pisen — este chequeo es la segunda capa,
 * para cualquier otro camino de escritura que no pase por acá (mismo patrón que
 * `venta.service.ts` usa para el correlativo de comprobantes). */
const UNIQUE_VIOLATION = '23505';
const INDICE_PROVEEDOR_GLOBAL = 'IDX_un_proveedor_global';

function esColisionDeProveedor(error: unknown): boolean {
  const driverError = (error as { driverError?: { code?: string; constraint?: string } })
    ?.driverError;
  return driverError?.code === UNIQUE_VIOLATION && driverError?.constraint === INDICE_PROVEEDOR_GLOBAL;
}

export interface ResumenProveedor {
  id: string;
  email: string;
  activo: boolean;
}

/** Mismo criterio de normalización que el registro público de cuentas (`demo.dto.ts`):
 * los emails se guardan en minúsculas, así que comparar sin normalizar podría no encontrar
 * un usuario que sí existe. */
function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function comoResumen(usuario: Usuario): ResumenProveedor {
  return { id: usuario.id, email: usuario.email, activo: usuario.activo };
}

/**
 * Marca a `email` como proveedor. Rechaza (sin modificar nada) si: el email viene vacío, el
 * usuario no existe, está inactivo, tiene una rotación de contraseña pendiente
 * (`debeCambiarPassword`, ver H01 Etapa 1 — nadie con una contraseña todavía no confirmada
 * puede recibir el privilegio más alto del sistema), o ya existe un proveedor **distinto**.
 *
 * Si el usuario indicado YA es el proveedor, la operación es idempotente (no falla): un script
 * de despliegue que se reintenta, o un operador que corre el comando dos veces por error, debe
 * obtener el mismo resultado ambas veces. Agregar un segundo proveedor distinto en cambio
 * **siempre** se rechaza — es la única forma de garantizar el máximo de uno a la vez sin
 * `--permitir-multiples`.
 */
export async function asignarProveedor(emailCrudo: string): Promise<ResumenProveedor> {
  if (!emailCrudo?.trim()) {
    throw new HttpError(400, 'El email es obligatorio');
  }
  const email = normalizarEmail(emailCrudo);

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await activarBypassRls(queryRunner);
    // A partir de acá, hasta que termine la transacción, ninguna otra llamada concurrente a
    // esta función puede avanzar más allá de este punto.
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [CLAVE_ADVISORY_LOCK_PROVEEDOR]);

    const repo = queryRunner.manager.getRepository(Usuario);
    const usuario = await repo.findOne({ where: { email } });
    if (!usuario) {
      throw new HttpError(404, `No existe ningún usuario con el email "${email}"`);
    }
    if (!usuario.activo) {
      throw new HttpError(400, 'El usuario está inactivo');
    }
    if (usuario.debeCambiarPassword) {
      throw new HttpError(
        400,
        'El usuario tiene una rotación de contraseña pendiente: no puede asignarse como ' +
          'proveedor hasta que la complete',
      );
    }

    if (usuario.esProveedor) {
      await queryRunner.commitTransaction();
      return comoResumen(usuario);
    }

    const otroProveedor = await repo.findOne({ where: { esProveedor: true } });
    if (otroProveedor) {
      throw new HttpError(
        409,
        `Ya existe un proveedor (${otroProveedor.email}). Quítaselo primero con ` +
          'quitarProveedor antes de asignar uno distinto.',
      );
    }

    usuario.esProveedor = true;
    await repo.save(usuario);
    await queryRunner.commitTransaction();
    return comoResumen(usuario);
  } catch (error) {
    if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
    if (esColisionDeProveedor(error)) {
      throw new HttpError(
        409,
        'Ya existe un proveedor. Quítaselo primero con quitarProveedor antes de asignar uno distinto.',
      );
    }
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/**
 * Le quita la marca de proveedor a `email`, exclusivamente a ese usuario — nunca elige un
 * sustituto. Dejar el sistema sin ningún proveedor es un resultado válido: la recuperación es
 * explícita, con `asignarProveedor` sobre la cuenta que corresponda.
 */
export async function quitarProveedor(emailCrudo: string): Promise<ResumenProveedor> {
  if (!emailCrudo?.trim()) {
    throw new HttpError(400, 'El email es obligatorio');
  }
  const email = normalizarEmail(emailCrudo);

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await activarBypassRls(queryRunner);
    await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [CLAVE_ADVISORY_LOCK_PROVEEDOR]);

    const repo = queryRunner.manager.getRepository(Usuario);
    const usuario = await repo.findOne({ where: { email } });
    if (!usuario) {
      throw new HttpError(404, `No existe ningún usuario con el email "${email}"`);
    }

    usuario.esProveedor = false;
    await repo.save(usuario);
    await queryRunner.commitTransaction();
    return comoResumen(usuario);
  } catch (error) {
    if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/** Solo lectura. Nunca incluye `passwordHash` ni ningún otro dato sensible — `ResumenProveedor`
 * solo expone id/email/activo. */
export async function listarProveedores(): Promise<ResumenProveedor[]> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await activarBypassRls(queryRunner);
    const repo = queryRunner.manager.getRepository(Usuario);
    const proveedores = await repo.find({ where: { esProveedor: true } });
    await queryRunner.commitTransaction();
    return proveedores.map(comoResumen);
  } catch (error) {
    if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
