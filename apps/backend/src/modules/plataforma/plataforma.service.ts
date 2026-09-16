import { HttpError } from '../../utils/http-error';
import { conBypassRls } from '../../database/tenant-context';
import { empresaRepository } from '../empresa/empresa.repository';
import { PlanEmpresa } from '../empresa/empresa.entity';
import { calcularSuscripcion } from '../suscripcion/suscripcion.service';
import { solicitudSuscripcionRepository } from '../suscripcion/solicitud-suscripcion.repository';
import { EstadoSolicitudSuscripcion } from '../suscripcion/solicitud-suscripcion.entity';
import type { EstadoSuscripcion } from '../suscripcion/suscripcion.service';
import type { SolicitudSuscripcion } from '../suscripcion/solicitud-suscripcion.entity';

export interface EmpresaEnPanel {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  slug: string;
  email: string | null;
  telefono: string | null;
  plan: PlanEmpresa;
  estado: EstadoSuscripcion;
  diasRestantes: number | null;
  expiraEn: string | null;
  creadaPorAutoservicio: boolean;
  creadoEn: string;
  /** Uso acumulado desde el alta. */
  peticiones: number;
  escrituras: number;
  diasConActividad: number;
  ultimoAcceso: string | null;
}

export interface ResumenPanel {
  totalEmpresas: number;
  demosActivas: number;
  demosVencidas: number;
  clientesActivos: number;
  suspendidas: number;
  /** Empresas con al menos una escritura en los últimos 7 días. */
  activasUltimos7Dias: number;
  empresas: EmpresaEnPanel[];
}

interface FilaUso {
  empresa_id: string;
  peticiones: string;
  escrituras: string;
  dias: string;
  ultimo_acceso: string | null;
  escrituras_7d: string;
}

/**
 * Panel del proveedor: todas las empresas con su suscripción y su uso real.
 *
 * Es el único punto del sistema que consulta a través de todas las empresas, y por eso corre
 * bajo `conBypassRls`. Que sea una excepción explícita y concentrada en un módulo es
 * deliberado: hace que revisar "¿qué código puede ver datos de todos los clientes?" sea leer
 * un archivo, no auditar treinta services.
 */
export async function obtenerPanel(): Promise<ResumenPanel> {
  return conBypassRls(async () => {
    const empresas = await empresaRepository.find({ order: { creadoEn: 'DESC' } });

    // El uso se agrega en SQL: traer todas las filas diarias de todas las empresas a memoria
    // para sumarlas en JavaScript crecería sin límite con el tiempo.
    const filas: FilaUso[] = await empresaRepository.query(`
      SELECT
        "empresa_id",
        COALESCE(SUM("peticiones"), 0) AS peticiones,
        COALESCE(SUM("escrituras"), 0) AS escrituras,
        COUNT(*) AS dias,
        MAX("ultimo_acceso") AS ultimo_acceso,
        COALESCE(SUM("escrituras") FILTER (WHERE "fecha" >= CURRENT_DATE - INTERVAL '7 days'), 0)
          AS escrituras_7d
      FROM "registros_uso"
      GROUP BY "empresa_id"
    `);
    const usoPorEmpresa = new Map(filas.map((fila) => [fila.empresa_id, fila]));

    const listado: EmpresaEnPanel[] = empresas.map((empresa) => {
      const suscripcion = calcularSuscripcion(empresa);
      const uso = usoPorEmpresa.get(empresa.id);
      return {
        id: empresa.id,
        ruc: empresa.ruc,
        razonSocial: empresa.razonSocial,
        nombreComercial: empresa.nombreComercial,
        slug: empresa.slug,
        email: empresa.email,
        telefono: empresa.telefono,
        plan: empresa.plan,
        estado: suscripcion.estado,
        diasRestantes: suscripcion.diasRestantes,
        expiraEn: suscripcion.expiraEn,
        creadaPorAutoservicio: empresa.creadaPorAutoservicio,
        creadoEn: empresa.creadoEn.toISOString(),
        peticiones: Number(uso?.peticiones ?? 0),
        escrituras: Number(uso?.escrituras ?? 0),
        diasConActividad: Number(uso?.dias ?? 0),
        ultimoAcceso: uso?.ultimo_acceso ?? null,
      };
    });

    return {
      totalEmpresas: listado.length,
      demosActivas: listado.filter((e) => e.estado === 'demo').length,
      demosVencidas: listado.filter((e) => e.estado === 'demo_vencida').length,
      clientesActivos: listado.filter((e) => e.estado === 'activa').length,
      suspendidas: listado.filter((e) => e.estado === 'suspendida').length,
      activasUltimos7Dias: filas.filter((fila) => Number(fila.escrituras_7d) > 0).length,
      empresas: listado,
    };
  });
}

/** Detalle día a día del uso de una empresa, para ver si la prueba se está usando de verdad. */
export async function obtenerUsoDiario(
  empresaId: string,
): Promise<Array<{ fecha: string; peticiones: number; escrituras: number }>> {
  return conBypassRls(async () => {
    const filas: Array<{ fecha: string; peticiones: number; escrituras: number }> =
      await empresaRepository.query(
        `SELECT "fecha"::text, "peticiones", "escrituras"
           FROM "registros_uso"
          WHERE "empresa_id" = $1
          ORDER BY "fecha" DESC
          LIMIT 90`,
        [empresaId],
      );
    return filas;
  });
}

export type AccionSobreEmpresa =
  | { tipo: 'activar' }
  | { tipo: 'extender_demo'; dias: number }
  | { tipo: 'suspender' }
  | { tipo: 'reactivar' };

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Cambia el estado comercial de una empresa. Es la contraparte operativa del panel: cuando
 * un restaurante contrata, se le activa; si pide más tiempo para decidir, se le extiende.
 */
export async function aplicarAccion(empresaId: string, accion: AccionSobreEmpresa) {
  return conBypassRls(async () => {
    const empresa = await empresaRepository.findOneBy({ id: empresaId });
    if (!empresa) {
      throw new HttpError(404, 'Empresa no encontrada');
    }

    switch (accion.tipo) {
      case 'activar':
        // Pasa a cuenta contratada: sin fecha de vencimiento. Se limpia `demoExpiraEn` para
        // que no quede una fecha pasada colgando que confunda al leer la fila.
        empresa.plan = PlanEmpresa.ACTIVO;
        empresa.demoExpiraEn = null;
        empresa.suspendida = false;
        break;
      case 'extender_demo': {
        // Se extiende desde hoy, no desde la fecha original: si la demo venció hace un mes,
        // sumarle días a esa fecha la dejaría vencida igual.
        const base = Math.max(empresa.demoExpiraEn?.getTime() ?? 0, Date.now());
        empresa.plan = PlanEmpresa.DEMO;
        empresa.demoExpiraEn = new Date(base + accion.dias * MS_POR_DIA);
        empresa.suspendida = false;
        break;
      }
      case 'suspender':
        empresa.suspendida = true;
        break;
      case 'reactivar':
        empresa.suspendida = false;
        break;
    }

    await empresaRepository.save(empresa);
    return calcularSuscripcion(empresa);
  });
}

const MS_POR_DIA_SOLICITUDES = 24 * 60 * 60 * 1000;
const DIAS_POR_MES = 30;

/** Solicitudes de suscripción pendientes de revisar, de todas las empresas — mismo criterio
 * de `conBypassRls` que el resto del panel (ver comentario de `obtenerPanel`). */
export async function listarSolicitudesPendientes(): Promise<SolicitudSuscripcion[]> {
  return conBypassRls(() =>
    solicitudSuscripcionRepository.find({
      where: { estado: EstadoSolicitudSuscripcion.PENDIENTE },
      relations: { empresa: true },
      order: { creadoEn: 'ASC' },
    }),
  );
}

/**
 * Confirma que el pago de una solicitud llegó (hoy, revisado a mano por el proveedor — Yape,
 * transferencia; no hay pasarela conectada todavía) y activa la empresa por los meses
 * pagados. Es el mismo punto donde, el día que se conecte un webhook real de Culqi/Mercado
 * Pago, se llamaría esta función en vez del botón del panel — el resto del flujo no cambia.
 *
 * Los meses se suman desde `max(hoy, lo que la empresa ya tenía)`: pagar una renovación antes
 * de que venza no "pierde" los días que le quedaban, y pagar tarde no le regala los días ya
 * vencidos de más.
 */
export async function confirmarSolicitud(solicitudId: string): Promise<SolicitudSuscripcion> {
  return conBypassRls(async () => {
    const solicitud = await solicitudSuscripcionRepository.findOne({
      where: { id: solicitudId },
      relations: { empresa: true },
    });
    if (!solicitud) {
      throw new HttpError(404, 'Solicitud no encontrada');
    }
    if (solicitud.estado !== EstadoSolicitudSuscripcion.PENDIENTE) {
      throw new HttpError(409, 'Esta solicitud ya fue revisada');
    }

    const empresa = solicitud.empresa;
    const base = Math.max(empresa.suscripcionExpiraEn?.getTime() ?? 0, Date.now());
    empresa.plan = PlanEmpresa.ACTIVO;
    empresa.planContratado = solicitud.plan;
    empresa.suscripcionExpiraEn = new Date(
      base + solicitud.meses * DIAS_POR_MES * MS_POR_DIA_SOLICITUDES,
    );
    empresa.suspendida = false;
    await empresaRepository.save(empresa);

    solicitud.estado = EstadoSolicitudSuscripcion.CONFIRMADA;
    solicitud.confirmadoEn = new Date();
    return solicitudSuscripcionRepository.save(solicitud);
  });
}

export async function rechazarSolicitud(solicitudId: string): Promise<SolicitudSuscripcion> {
  return conBypassRls(async () => {
    const solicitud = await solicitudSuscripcionRepository.findOneBy({ id: solicitudId });
    if (!solicitud) {
      throw new HttpError(404, 'Solicitud no encontrada');
    }
    if (solicitud.estado !== EstadoSolicitudSuscripcion.PENDIENTE) {
      throw new HttpError(409, 'Esta solicitud ya fue revisada');
    }
    solicitud.estado = EstadoSolicitudSuscripcion.RECHAZADA;
    return solicitudSuscripcionRepository.save(solicitud);
  });
}
