import type { EntityManager } from 'typeorm';
import { enTransaccion } from '../../database/tenant-context';
import { HttpError } from '../../utils/http-error';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { medioPagoRepository, bancoRepository } from '../catalogos/catalogos.repository';
import { ventaRepository } from '../ventas/venta.repository';
import { EstadoVenta, FormaPago, Venta } from '../ventas/venta.entity';
import { pagoVentaRepository, cuotaVentaRepository } from './cobranza.repository';
import { PagoVenta } from './pago-venta.entity';
import { CuotaVenta } from './cuota-venta.entity';
import type { AnularPagoDto, RegistrarPagoDto } from './cobranza.dto';

/** Estado de cobranza de una venta al crédito, derivado del saldo y del vencimiento. */
export type EstadoCobranza = 'pendiente' | 'parcial' | 'pagada' | 'vencida';

export interface CobranzaVista {
  venta: Venta;
  cuotas: CuotaVenta[];
  pagos: PagoVenta[];
  total: number;
  pagado: number;
  saldo: number;
  estadoCobranza: EstadoCobranza;
  /** Vencimiento de la primera cuota impaga; null si ya está cancelada o no tiene cuotas. */
  proximoVencimiento: string | null;
  /** Días de atraso de `proximoVencimiento` (0 si aún no vence). */
  diasVencido: number;
}

const RELACIONES_VENTA = {
  cliente: { tipoDocumentoIdentidad: true },
  tipoComprobante: true,
  talonario: true,
  medioPago: true,
  banco: true,
} as const;

const RELACIONES_PAGO = { medioPago: true, banco: true, usuario: { personal: true } } as const;

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Hoy en formato `YYYY-MM-DD`, en hora local — el mismo huso en el que el cajero ve vencer
 * las cuotas (usar UTC adelantaría o atrasaría el vencimiento un día). */
function hoyIso(): string {
  const ahora = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
}

function diasEntre(desde: string, hasta: string): number {
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.floor((Date.parse(hasta) - Date.parse(desde)) / msPorDia);
}

/**
 * Arma la vista de cobranza de una venta: cuánto se pagó, cuánto falta y en qué estado está.
 *
 * El saldo se calcula sumando los pagos no anulados, nunca se guarda en la venta: un campo
 * `saldo` en `ventas` tendría que actualizarse en cada pago, cada anulación de pago y cada
 * anulación de venta, y bastaría un camino olvidado para que la deuda mostrada dejara de
 * coincidir con los cobros registrados.
 */
function armarVista(venta: Venta, cuotas: CuotaVenta[], pagos: PagoVenta[]): CobranzaVista {
  const vigentes = pagos.filter((pago) => !pago.anulado);
  const pagado = redondear(vigentes.reduce((suma, pago) => suma + pago.monto, 0));
  const saldo = redondear(venta.total - pagado);

  const ordenadas = [...cuotas].sort((a, b) => a.numero - b.numero);
  // Los pagos se aplican al saldo, no a una cuota concreta: para saber cuál es la primera
  // impaga se van cubriendo las cuotas en orden con lo cobrado hasta ahora.
  let restante = pagado;
  const primeraImpaga = ordenadas.find((cuota) => {
    if (restante >= cuota.monto) {
      restante = redondear(restante - cuota.monto);
      return false;
    }
    return true;
  });

  const hoy = hoyIso();
  const proximoVencimiento = saldo > 0 ? (primeraImpaga?.fechaVencimiento ?? null) : null;
  const diasVencido =
    proximoVencimiento && proximoVencimiento < hoy ? diasEntre(proximoVencimiento, hoy) : 0;

  let estadoCobranza: EstadoCobranza;
  if (saldo <= 0) {
    estadoCobranza = 'pagada';
  } else if (diasVencido > 0) {
    estadoCobranza = 'vencida';
  } else if (pagado > 0) {
    estadoCobranza = 'parcial';
  } else {
    estadoCobranza = 'pendiente';
  }

  return {
    venta,
    cuotas: ordenadas,
    pagos: [...pagos].sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime()),
    total: venta.total,
    pagado,
    saldo: Math.max(0, saldo),
    estadoCobranza,
    proximoVencimiento,
    diasVencido,
  };
}

/**
 * Cronograma de cuotas de una venta al crédito. Si el cajero no pactó cuotas, se genera una
 * sola por el total: SUNAT exige al menos el detalle de una cuota en un comprobante al
 * crédito, así que "sin cronograma" no es una opción válida.
 *
 * El reparto es en partes iguales y la última cuota absorbe la diferencia del redondeo, para
 * que la suma de las cuotas dé exactamente el total del comprobante.
 */
export function generarCuotas(
  total: number,
  fechaPrimerVencimiento: string,
  numeroCuotas: number,
): { numero: number; monto: number; fechaVencimiento: string }[] {
  const cantidad = Math.max(1, Math.floor(numeroCuotas));
  const montoBase = Math.floor((total / cantidad) * 100) / 100;
  const cuotas: { numero: number; monto: number; fechaVencimiento: string }[] = [];

  for (let numero = 1; numero <= cantidad; numero += 1) {
    const esUltima = numero === cantidad;
    const monto = esUltima ? redondear(total - montoBase * (cantidad - 1)) : montoBase;
    cuotas.push({
      numero,
      monto,
      fechaVencimiento: sumarMeses(fechaPrimerVencimiento, numero - 1),
    });
  }
  return cuotas;
}

/** Suma meses a una fecha `YYYY-MM-DD` acotando el día al último del mes destino (31 de enero
 * + 1 mes = 28/29 de febrero, no el 2 o 3 de marzo que daría `setMonth` por sí solo). */
function sumarMeses(fechaIso: string, meses: number): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number) as [number, number, number];
  const destino = new Date(anio, mes - 1 + meses, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(dia, ultimoDia));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${destino.getFullYear()}-${pad(destino.getMonth() + 1)}-${pad(destino.getDate())}`;
}

/** Guarda el cronograma de una venta al crédito recién creada. Llamado desde `venta.service`
 * dentro de la misma transacción que la venta. */
export async function guardarCuotas(
  manager: EntityManager,
  venta: Venta,
  fechaPrimerVencimiento: string,
  numeroCuotas: number,
): Promise<void> {
  const cuotas = generarCuotas(venta.total, fechaPrimerVencimiento, numeroCuotas).map((cuota) =>
    manager.create(CuotaVenta, { ...cuota, venta }),
  );
  await manager.save(CuotaVenta, cuotas);
}

async function cargarVista(venta: Venta): Promise<CobranzaVista> {
  const [cuotas, pagos] = await Promise.all([
    cuotaVentaRepository.find({ where: { venta: { id: venta.id } } }),
    pagoVentaRepository.find({ where: { venta: { id: venta.id } }, relations: RELACIONES_PAGO }),
  ]);
  return armarVista(venta, cuotas, pagos);
}

/**
 * Documentos por cobrar: las ventas al crédito emitidas (una venta anulada ya no se cobra).
 * `soloPendientes` deja fuera las canceladas, que es la vista por defecto de la pantalla.
 */
export async function listarCuentasPorCobrar(soloPendientes = false): Promise<CobranzaVista[]> {
  const ventas = await ventaRepository.find({
    where: { formaPago: FormaPago.CREDITO, estado: EstadoVenta.EMITIDA },
    relations: RELACIONES_VENTA,
    order: { creadoEn: 'DESC' },
  });

  const vistas = await Promise.all(ventas.map(cargarVista));
  return soloPendientes ? vistas.filter((vista) => vista.saldo > 0) : vistas;
}

export async function obtenerCobranza(ventaId: string): Promise<CobranzaVista> {
  const venta = await ventaRepository.findOne({
    where: { id: ventaId },
    relations: RELACIONES_VENTA,
  });
  if (!venta) {
    throw new HttpError(404, 'Venta no encontrada');
  }
  return cargarVista(venta);
}

/**
 * Registra un cobro contra una venta al crédito.
 *
 * Se hace dentro de una transacción con la venta bloqueada (`FOR UPDATE`): dos cajeros
 * registrando cobros del mismo cliente a la vez leerían el mismo saldo y podrían dejar la
 * venta sobrepagada. Es el mismo criterio del correlativo de talonarios.
 */
export async function registrarPago(
  ventaId: string,
  usuarioId: string,
  dto: RegistrarPagoDto,
): Promise<CobranzaVista> {
  const medioPago = await medioPagoRepository.findOneBy({ id: dto.medioPagoId });
  if (!medioPago) {
    throw new HttpError(400, 'El medio de pago indicado no existe', ['medioPagoId inválido']);
  }

  // Ley 28194 (bancarización): un cobro que entra por el sistema financiero tiene que quedar
  // sustentado con la entidad y el número de operación, o no sirve como sustento ante SUNAT.
  let banco = null;
  if (medioPago.requiereBanco) {
    if (!dto.bancoId) {
      throw new HttpError(400, `Un pago por ${medioPago.nombre.toLowerCase()} requiere el banco`, [
        'bancoId requerido',
      ]);
    }
    if (!dto.numeroOperacion) {
      throw new HttpError(
        400,
        `Un pago por ${medioPago.nombre.toLowerCase()} requiere el número de operación`,
        ['numeroOperacion requerido'],
      );
    }
    banco = await bancoRepository.findOneBy({ id: dto.bancoId });
    if (!banco) {
      throw new HttpError(400, 'El banco indicado no existe', ['bancoId inválido']);
    }
  }

  const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
  if (!usuario) {
    throw new HttpError(401, 'No autenticado');
  }

  await enTransaccion(async (manager) => {
    const venta = await manager.findOne(Venta, {
      where: { id: ventaId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!venta) {
      throw new HttpError(404, 'Venta no encontrada');
    }
    if (venta.estado === EstadoVenta.ANULADA) {
      throw new HttpError(400, 'No se puede cobrar una venta anulada');
    }
    if (venta.formaPago !== FormaPago.CREDITO) {
      throw new HttpError(400, 'Solo se registran cobros sobre ventas al crédito');
    }

    const pagosPrevios = await manager.find(PagoVenta, { where: { venta: { id: ventaId } } });
    const pagado = redondear(
      pagosPrevios.filter((p) => !p.anulado).reduce((suma, p) => suma + p.monto, 0),
    );
    const saldo = redondear(venta.total - pagado);

    if (saldo <= 0) {
      throw new HttpError(400, 'Esta venta ya está totalmente cancelada');
    }
    if (dto.monto > saldo) {
      throw new HttpError(
        400,
        `El monto excede el saldo pendiente (S/ ${saldo.toFixed(2)}). Registra como máximo ese importe.`,
      );
    }

    await manager.save(
      PagoVenta,
      manager.create(PagoVenta, {
        venta,
        fechaPago: dto.fechaPago,
        monto: dto.monto,
        medioPago,
        banco,
        numeroOperacion: dto.numeroOperacion ?? null,
        observacion: dto.observacion ?? null,
        usuario,
      }),
    );
  });

  return obtenerCobranza(ventaId);
}

/** Anula un cobro mal registrado. La fila se conserva con su motivo (nunca se borra) y el
 * saldo vuelve a subir solo, porque se calcula desde los pagos vigentes. */
export async function anularPago(pagoId: string, dto: AnularPagoDto): Promise<CobranzaVista> {
  const pago = await pagoVentaRepository.findOne({
    where: { id: pagoId },
    relations: { venta: true },
  });
  if (!pago) {
    throw new HttpError(404, 'Pago no encontrado');
  }
  if (pago.anulado) {
    throw new HttpError(400, 'El pago ya está anulado');
  }

  pago.anulado = true;
  pago.motivoAnulacion = dto.motivo;
  await pagoVentaRepository.save(pago);

  return obtenerCobranza(pago.venta.id);
}
