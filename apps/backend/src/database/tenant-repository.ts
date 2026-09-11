import { AppDataSource } from './data-source';
import { empresaIdActualOpcional, managerActual } from './tenant-context';
import type { EntityTarget, ObjectLiteral, Repository } from 'typeorm';

/** Nombre de la propiedad de relación con la empresa dueña en las entidades multi-empresa. */
const PROPIEDAD_EMPRESA = 'empresa';

function tieneColumnaEmpresa(repo: Repository<ObjectLiteral>): boolean {
  return repo.metadata.relations.some((relacion) => relacion.propertyName === PROPIEDAD_EMPRESA);
}

/**
 * Estampa la empresa de la petición en las entidades que se van a guardar y todavía no la
 * tienen. Sin esto, cada `create(...)` de cada service tendría que acordarse de poner la
 * empresa a mano — y el que se olvidara escribiría una fila que la política `WITH CHECK` de
 * Postgres rechaza (mejor que escribir una fila huérfana, pero un error en tiempo de
 * ejecución igual). Estampar acá lo vuelve imposible de olvidar.
 *
 * Si la entidad ya trae empresa, se respeta: hay casos legítimos donde el service la fija
 * explícitamente (el aprovisionamiento de una demo crea filas para la empresa recién nacida,
 * antes de que exista un usuario suyo que autentique la petición).
 */
function estampar(entidad: unknown, empresaId: string | null): void {
  if (!empresaId || typeof entidad !== 'object' || entidad === null) return;
  const registro = entidad as Record<string, unknown>;
  if (registro[PROPIEDAD_EMPRESA] === undefined || registro[PROPIEDAD_EMPRESA] === null) {
    registro[PROPIEDAD_EMPRESA] = { id: empresaId };
  }
}

/**
 * Repositorio consciente de la empresa de la petición. Reemplaza a
 * `AppDataSource.getRepository(X)` en todas las entidades multi-empresa.
 *
 * Hace dos cosas, y ninguna es "filtrar por empresa en el `where`":
 *
 * 1. **Enruta cada consulta por la transacción de la petición.** Es la única conexión donde
 *    está seteado `app.empresa_id`, y por lo tanto la única donde las políticas RLS de
 *    Postgres dejan ver algo. El filtrado por empresa lo hace la base de datos, no este
 *    código: así también quedan cubiertas las consultas SQL crudas (`repository.query(...)`)
 *    de Reportes, Costeo y Kardex, que un filtro escrito en TypeScript nunca habría tocado.
 * 2. **Estampa la empresa al escribir**, porque alguien tiene que proveer el `empresa_id` y
 *    el `WITH CHECK` de la política solo verifica que sea el correcto.
 *
 * Fuera de una petición (arranque, migraciones, scripts) cae al manager por defecto y no
 * estampa nada — ahí no hay empresa que asumir, y las migraciones corren como dueño de las
 * tablas, que no está sujeto a RLS.
 */
export function tenantRepository<T extends ObjectLiteral>(entidad: EntityTarget<T>): Repository<T> {
  const resolver = (): Repository<T> =>
    (managerActual() ?? AppDataSource.manager).getRepository(entidad);

  return new Proxy({} as Repository<T>, {
    get(_objetivo, propiedad, receptor) {
      const repo = resolver();
      const valor = Reflect.get(repo, propiedad, receptor) as unknown;
      if (typeof valor !== 'function') return valor;

      const metodo = valor as (...args: unknown[]) => unknown;

      if (propiedad === 'save' || propiedad === 'insert') {
        return (...args: unknown[]) => {
          if (tieneColumnaEmpresa(repo as unknown as Repository<ObjectLiteral>)) {
            const empresaId = empresaIdActualOpcional();
            const objetivo = args[0];
            if (Array.isArray(objetivo)) objetivo.forEach((fila) => estampar(fila, empresaId));
            else estampar(objetivo, empresaId);
          }
          return metodo.apply(repo, args);
        };
      }

      return metodo.bind(repo);
    },
  });
}
