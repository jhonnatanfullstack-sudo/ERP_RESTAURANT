import { Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { enTransaccion } from '../../database/tenant-context';
import { ventaRepository } from '../ventas/venta.repository';
import { EstadoVenta } from '../ventas/venta.entity';
import { turnoRepository } from '../turnos/turno.repository';
import { EstadoTurno } from '../turnos/turno.entity';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { Usuario } from '../usuarios/usuario.entity';
import { repartoPropinaRepository } from './reparto-propina.repository';
import { RepartoPropina, MetodoRepartoPropina } from './reparto-propina.entity';
import { DetalleRepartoPropina } from './detalle-reparto-propina.entity';
import type { CrearRepartoDto, VistaPreviaRepartoDto } from './reparto-propina.dto';

const RELACIONES = {
  usuarioRegistro: { personal: true },
  detalles: { usuario: { personal: true } },
} as const;

interface Participante {
  usuario: Usuario;
  horas: number;
}

interface MontoParticipante {
  usuario: Usuario;
  horas: number | null;
  monto: number;
}

/** Suma de `ventas.propina` emitidas dentro del período — mismo criterio que
 * `caja.service.ts: calcularVentasEfectivo`, pero sobre todas las ventas, no solo en efectivo:
 * la propina no distingue medio de pago. */
async function calcularTotalPropinas(desde: Date, hasta: Date): Promise<number> {
  const ventas = await ventaRepository.find({
    where: { estado: EstadoVenta.EMITIDA, creadoEn: Between(desde, hasta) },
  });
  return Math.round(ventas.reduce((suma, v) => suma + v.propina, 0) * 100) / 100;
}

/**
 * Quién trabajó dentro del período: turnos cerrados que se solapan con `[desde, hasta]`. Las
 * horas se recortan al propio rango — un turno que empezó antes o terminó después solo cuenta
 * la parte que efectivamente cae dentro del período que se está repartiendo.
 */
async function calcularParticipantes(desde: Date, hasta: Date): Promise<Participante[]> {
  const turnos = await turnoRepository.find({
    where: {
      estado: EstadoTurno.CERRADO,
      creadoEn: LessThanOrEqual(hasta),
      fechaCierre: MoreThanOrEqual(desde),
    },
    relations: { usuario: { personal: true } },
  });

  const porUsuario = new Map<string, Participante>();
  for (const turno of turnos) {
    const inicio = Math.max(turno.creadoEn.getTime(), desde.getTime());
    const fin = Math.min(turno.fechaCierre!.getTime(), hasta.getTime());
    const horas = (fin - inicio) / 3_600_000;
    if (horas <= 0) continue;

    const actual = porUsuario.get(turno.usuario.id);
    if (actual) {
      actual.horas += horas;
    } else {
      porUsuario.set(turno.usuario.id, { usuario: turno.usuario, horas });
    }
  }
  return Array.from(porUsuario.values());
}

/**
 * Reparte `total` entre `participantes` según `metodo`. El redondeo a 2 decimales de cada
 * monto puede dejar un resto de centavos por el camino (ej. S/ 10 entre 3 personas); ese resto
 * se ajusta en el último participante (orden estable por id) para que la suma cuadre siempre
 * con `total` exacto, ni un centavo de más ni de menos.
 */
function repartir(
  total: number,
  participantes: Participante[],
  metodo: MetodoRepartoPropina,
): MontoParticipante[] {
  const ordenados = [...participantes].sort((a, b) => a.usuario.id.localeCompare(b.usuario.id));
  const totalHoras = ordenados.reduce((suma, p) => suma + p.horas, 0);

  const montos = ordenados.map((p) => {
    const proporcion =
      metodo === MetodoRepartoPropina.IGUALITARIO ? 1 / ordenados.length : p.horas / totalHoras;
    return Math.round(total * proporcion * 100) / 100;
  });

  const diferencia = Math.round((total - montos.reduce((suma, m) => suma + m, 0)) * 100) / 100;
  if (montos.length > 0) {
    montos[montos.length - 1] = Math.round((montos[montos.length - 1] + diferencia) * 100) / 100;
  }

  return ordenados.map((p, indice) => ({
    usuario: p.usuario,
    horas: metodo === MetodoRepartoPropina.POR_HORAS ? Math.round(p.horas * 100) / 100 : null,
    monto: montos[indice],
  }));
}

export interface VistaPreviaReparto {
  totalPropinas: number;
  participantes: MontoParticipante[];
}

/** Mismo cálculo que `crearReparto`, sin guardar nada — para que el usuario revise los montos
 * antes de confirmarlos. */
export async function vistaPreviaReparto(dto: VistaPreviaRepartoDto): Promise<VistaPreviaReparto> {
  const totalPropinas = await calcularTotalPropinas(dto.fechaDesde, dto.fechaHasta);
  const participantes = await calcularParticipantes(dto.fechaDesde, dto.fechaHasta);
  return { totalPropinas, participantes: repartir(totalPropinas, participantes, dto.metodo) };
}

export async function listarRepartos(): Promise<RepartoPropina[]> {
  return repartoPropinaRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
}

export async function obtenerReparto(id: string): Promise<RepartoPropina> {
  const reparto = await repartoPropinaRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!reparto) {
    throw new HttpError(404, 'Reparto no encontrado');
  }
  return reparto;
}

/**
 * Registra el reparto: congela el total de propinas y el monto de cada participante en ese
 * momento. No es editable después —mismo criterio que una `Caja` cerrada— porque es un cierre
 * contable: si una venta del período se anula más tarde, no debe alterar un reparto ya
 * entregado al personal.
 */
export async function crearReparto(usuarioId: string, dto: CrearRepartoDto): Promise<RepartoPropina> {
  const totalPropinas = await calcularTotalPropinas(dto.fechaDesde, dto.fechaHasta);
  if (totalPropinas <= 0) {
    throw new HttpError(400, 'No hay propinas recaudadas en ese período');
  }

  const participantes = await calcularParticipantes(dto.fechaDesde, dto.fechaHasta);
  if (participantes.length === 0) {
    throw new HttpError(
      409,
      'Nadie tiene un turno cerrado dentro de ese período: no hay a quién repartir. Cierra los turnos correspondientes primero.',
    );
  }

  const usuarioRegistro = await usuarioRepository.findOneBy({ id: usuarioId });
  if (!usuarioRegistro) {
    throw new HttpError(401, 'Usuario no encontrado');
  }

  const montos = repartir(totalPropinas, participantes, dto.metodo);

  const guardado = await enTransaccion(async (manager) => {
    const reparto = manager.create(RepartoPropina, {
      fechaDesde: dto.fechaDesde,
      fechaHasta: dto.fechaHasta,
      metodo: dto.metodo,
      totalPropinas,
      usuarioRegistro,
      observacion: dto.observacion ?? null,
    });
    const nuevoReparto = await manager.save(RepartoPropina, reparto);

    const detalles = montos.map((m) =>
      manager.create(DetalleRepartoPropina, {
        repartoPropina: nuevoReparto,
        usuario: m.usuario,
        horasTrabajadas: m.horas,
        monto: m.monto,
      }),
    );
    await manager.save(DetalleRepartoPropina, detalles);

    return nuevoReparto;
  });

  return obtenerReparto(guardado.id);
}
