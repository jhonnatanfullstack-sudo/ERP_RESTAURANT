import { env } from '../../config/env';
import { empresaIdActual } from '../../database/tenant-context';
import { HttpError } from '../../utils/http-error';
import { empresaRepository } from '../empresa/empresa.repository';
import { registroUsoRepository } from './registro-uso.repository';
import { solicitudSuscripcionRepository } from './solicitud-suscripcion.repository';
import { PlanEmpresa } from '../empresa/empresa.entity';
import { MESES_POR_CICLO, calcularMonto } from './planes';
import type { Empresa } from '../empresa/empresa.entity';
import type { CrearSolicitudDto } from './solicitud-suscripcion.dto';
import type { SolicitudSuscripcion } from './solicitud-suscripcion.entity';

export type EstadoSuscripcion =
  'activa' | 'demo' | 'demo_vencida' | 'suscripcion_vencida' | 'suspendida';

export interface ResumenSuscripcion {
  estado: EstadoSuscripcion;
  plan: PlanEmpresa;
  /** Días completos que le quedan a la demo. `null` en una cuenta contratada. */
  diasRestantes: number | null;
  expiraEn: string | null;
  /** Si la empresa puede modificar datos. Una demo vencida queda en solo lectura. */
  puedeEscribir: boolean;
  /** Datos del proveedor, para que la empresa sepa a quién contactar cuando se le venza. */
  contactoProveedor: { nombre: string; email: string | null; telefono: string | null };
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Estado de la suscripción, **derivado** de los datos de la empresa en cada consulta.
 *
 * No existe una columna "estado" que haya que mantener al día: el vencimiento sale de
 * comparar `demoExpiraEn` contra el reloj. Así no hace falta una tarea programada que marque
 * las demos vencidas cada noche, y no existe la ventana en la que una demo ya venció pero la
 * columna todavía dice que está activa.
 */
export function calcularSuscripcion(empresa: Empresa): ResumenSuscripcion {
  const contactoProveedor = {
    nombre: env.proveedor.nombre,
    email: env.proveedor.email,
    telefono: env.proveedor.telefono,
  };

  if (empresa.suspendida) {
    return {
      estado: 'suspendida',
      plan: empresa.plan,
      diasRestantes: null,
      expiraEn: empresa.demoExpiraEn?.toISOString() ?? null,
      puedeEscribir: false,
      contactoProveedor,
    };
  }

  if (empresa.plan === PlanEmpresa.ACTIVO) {
    // Una cuenta contratada sin `suscripcionExpiraEn` es la activación manual de siempre
    // (botón "Activar" del panel): sin plazo, como antes de que existiera la página de
    // precios. Con `suscripcionExpiraEn` puesta, vence igual que una demo, solo que por un
    // plazo pagado en vez de una prueba.
    if (!empresa.suscripcionExpiraEn) {
      return {
        estado: 'activa',
        plan: empresa.plan,
        diasRestantes: null,
        expiraEn: null,
        puedeEscribir: true,
        contactoProveedor,
      };
    }

    const restanteMs = empresa.suscripcionExpiraEn.getTime() - Date.now();
    const vencida = restanteMs <= 0;
    return {
      estado: vencida ? 'suscripcion_vencida' : 'activa',
      plan: empresa.plan,
      diasRestantes: vencida ? 0 : Math.ceil(restanteMs / MS_POR_DIA),
      expiraEn: empresa.suscripcionExpiraEn.toISOString(),
      puedeEscribir: !vencida,
      contactoProveedor,
    };
  }

  if (!empresa.demoExpiraEn) {
    return {
      estado: 'activa',
      plan: empresa.plan,
      diasRestantes: null,
      expiraEn: null,
      puedeEscribir: true,
      contactoProveedor,
    };
  }

  const restanteMs = empresa.demoExpiraEn.getTime() - Date.now();
  const vencida = restanteMs <= 0;

  return {
    estado: vencida ? 'demo_vencida' : 'demo',
    plan: empresa.plan,
    // Se redondea hacia arriba para que el último día se muestre como "queda 1 día" y no
    // como "quedan 0", que se leería como ya vencida.
    diasRestantes: vencida ? 0 : Math.ceil(restanteMs / MS_POR_DIA),
    expiraEn: empresa.demoExpiraEn.toISOString(),
    puedeEscribir: !vencida,
    contactoProveedor,
  };
}

export async function obtenerSuscripcionDeEmpresa(empresaId: string): Promise<ResumenSuscripcion> {
  const empresa = await empresaRepository.findOneByOrFail({ id: empresaId });
  return calcularSuscripcion(empresa);
}

const METODOS_DE_ESCRITURA = ['POST', 'PUT', 'PATCH', 'DELETE'];

export function esEscritura(metodo: string): boolean {
  return METODOS_DE_ESCRITURA.includes(metodo.toUpperCase());
}

/**
 * Suma una petición al contador del día de la empresa.
 *
 * Es un `UPSERT` sobre una fila diminuta (una fila por empresa y día) dentro de la
 * transacción que la petición ya tiene abierta, así que no agrega un viaje de red ni una
 * conexión. Se hace en SQL con `ON CONFLICT ... DO UPDATE` en vez de leer-modificar-escribir
 * porque dos peticiones simultáneas de la misma empresa perderían una de las dos cuentas.
 */
export async function registrarUso(empresaId: string, escritura: boolean): Promise<void> {
  await registroUsoRepository.query(
    `INSERT INTO "registros_uso" ("empresa_id", "fecha", "peticiones", "escrituras", "ultimo_acceso")
     VALUES ($1, CURRENT_DATE, 1, $2, now())
     ON CONFLICT ("empresa_id", "fecha") DO UPDATE
       SET "peticiones" = "registros_uso"."peticiones" + 1,
           "escrituras" = "registros_uso"."escrituras" + $2,
           "ultimo_acceso" = now(),
           "actualizado_en" = now()`,
    [empresaId, escritura ? 1 : 0],
  );
}

/**
 * Pide contratar (o renovar) un plan. Queda `pendiente` hasta que el proveedor confirme el
 * pago desde `/plataforma` (ver `plataforma.service.ts::confirmarSolicitud`) — esta función
 * solo dejar constancia de qué se pidió y a qué precio, nunca activa nada por sí sola.
 */
export async function solicitarSuscripcion(dto: CrearSolicitudDto): Promise<SolicitudSuscripcion> {
  const empresa = await empresaRepository.findOneBy({ id: empresaIdActual() });
  if (!empresa) {
    throw new HttpError(404, 'Empresa no encontrada');
  }

  const solicitud = solicitudSuscripcionRepository.create({
    empresa,
    plan: dto.plan,
    ciclo: dto.ciclo,
    meses: MESES_POR_CICLO[dto.ciclo],
    monto: calcularMonto(dto.plan, dto.ciclo),
    mensajeContacto: dto.mensajeContacto ?? null,
  });
  return solicitudSuscripcionRepository.save(solicitud);
}

export async function listarMisSolicitudes(): Promise<SolicitudSuscripcion[]> {
  return solicitudSuscripcionRepository.find({
    where: { empresa: { id: empresaIdActual() } },
    order: { creadoEn: 'DESC' },
  });
}
