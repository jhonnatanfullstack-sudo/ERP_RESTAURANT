import { Between, type FindOptionsWhere } from 'typeorm';
import { registroAuditoriaRepository } from './auditoria.repository';
import { ejecutarFueraDeLaPeticion } from '../../database/tenant-context';
import { AccionAuditoria, type RegistroAuditoria } from './registro-auditoria.entity';
import type { ConsultaAuditoriaDto } from './auditoria.dto';

const RELACIONES = { usuario: { personal: true } } as const;

interface DatosRegistro {
  usuarioId: string | null;
  /** Empresa dueña de la entrada. `null` en una petición que nunca llegó a autenticarse. */
  empresaId: string | null;
  accion: AccionAuditoria;
  modulo: string;
  recursoId: string | null;
  metodo: string;
  ruta: string;
  estadoHttp: number;
  ip: string | null;
  datos: Record<string, unknown> | null;
}

/**
 * Escribe una entrada en la bitácora. La llama el middleware una vez respondida la petición,
 * nunca un controlador: auditar es transversal y no parte de la lógica de cada módulo.
 */
export async function registrarAuditoria(datos: DatosRegistro): Promise<void> {
  // Sin empresa no hay dónde archivar la entrada: `registros_auditoria` pertenece a un
  // restaurante concreto y sus políticas RLS exigen saber a cuál. Es el caso de un intento de
  // login fallido con un correo inexistente, que no corresponde a ninguna empresa — queda
  // fuera de la bitácora por ahora, y registrarlo exigiría una bitácora de plataforma que
  // todavía no existe (ver `docs/api.md`).
  if (!datos.empresaId) return;

  return ejecutarFueraDeLaPeticion(datos.empresaId, () => escribirRegistro(datos));
}

async function escribirRegistro(datos: DatosRegistro): Promise<void> {
  const construir = (usuarioId: string | null, extra?: Record<string, unknown>) =>
    registroAuditoriaRepository.create({
      usuario: usuarioId ? ({ id: usuarioId } as RegistroAuditoria['usuario']) : null,
      accion: datos.accion,
      modulo: datos.modulo,
      recursoId: datos.recursoId,
      metodo: datos.metodo,
      ruta: datos.ruta,
      estadoHttp: datos.estadoHttp,
      ip: datos.ip,
      datos: extra ? { ...(datos.datos ?? {}), ...extra } : datos.datos,
    });

  try {
    await registroAuditoriaRepository.save(construir(datos.usuarioId));
  } catch (error) {
    // El único fallo esperable es que el `usuario_id` del token no exista en la tabla de
    // usuarios (token viejo de un usuario borrado, o directamente falsificado). Perder la
    // entrada sería lo peor que puede pasar: ese es justamente el movimiento que una
    // auditoría necesita conservar. Se reintenta sin la relación, dejando anotado a quién
    // decía pertenecer la sesión.
    if (!datos.usuarioId || !esViolacionDeClaveForanea(error)) throw error;
    await registroAuditoriaRepository.save(
      construir(null, { usuarioNoRegistrado: datos.usuarioId }),
    );
  }
}

/** Código `23503` de PostgreSQL: `foreign_key_violation`. */
function esViolacionDeClaveForanea(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503'
  );
}

export interface PaginaAuditoria {
  registros: RegistroAuditoria[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * Consulta paginada de la bitácora, de lo más reciente a lo más antiguo. Va paginada por
 * obligación: esta tabla crece con cada operación del restaurante y devolverla entera
 * terminaría tumbando la pantalla que la consulta.
 */
export async function listarAuditoria(consulta: ConsultaAuditoriaDto): Promise<PaginaAuditoria> {
  const where: FindOptionsWhere<RegistroAuditoria> = {};

  if (consulta.usuarioId) where.usuario = { id: consulta.usuarioId };
  if (consulta.modulo) where.modulo = consulta.modulo;
  if (consulta.accion) where.accion = consulta.accion as AccionAuditoria;
  if (consulta.desde && consulta.hasta) {
    // `hasta` es un día inclusivo: se extiende hasta su último instante.
    where.creadoEn = Between(
      new Date(`${consulta.desde}T00:00:00.000Z`),
      new Date(`${consulta.hasta}T23:59:59.999Z`),
    );
  }

  const [registros, total] = await registroAuditoriaRepository.findAndCount({
    where,
    relations: RELACIONES,
    order: { creadoEn: 'DESC' },
    skip: (consulta.pagina - 1) * consulta.porPagina,
    take: consulta.porPagina,
  });

  return { registros, total, pagina: consulta.pagina, porPagina: consulta.porPagina };
}

/** Módulos presentes en la bitácora, para poblar el filtro sin inventar una lista fija que
 * se desactualice cuando se agregue un módulo nuevo. */
export async function listarModulosAuditados(): Promise<string[]> {
  const filas: Array<{ modulo: string }> = await registroAuditoriaRepository
    .createQueryBuilder('registro')
    .select('DISTINCT registro.modulo', 'modulo')
    .orderBy('modulo', 'ASC')
    .getRawMany();
  return filas.map((fila) => fila.modulo);
}
