import { Between } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { medioPagoRepository } from '../catalogos/catalogos.repository';
import { ventaRepository } from '../ventas/venta.repository';
import { EstadoVenta } from '../ventas/venta.entity';
import { pagoVentaRepository } from '../cobranzas/cobranza.repository';
import { cajaRepository, movimientoCajaRepository } from './caja.repository';
import { Caja, EstadoCaja } from './caja.entity';
import { TipoMovimientoCaja } from './movimiento-caja.entity';
import type { AbrirCajaDto, CerrarCajaDto, RegistrarMovimientoDto } from './caja.dto';

/** Código del medio de pago "Efectivo" en el catálogo propio (ver SeedCatalogosVentas) —
 * es el único que afecta el efectivo físico de la caja; tarjeta/Yape/transferencia no. */
const CODIGO_MEDIO_PAGO_EFECTIVO = 'efectivo';

const RELACIONES = {
  usuarioApertura: { personal: true },
  usuarioCierre: { personal: true },
  movimientos: { usuario: { personal: true } },
} as const;

function ordenarMovimientos(caja: Caja): Caja {
  caja.movimientos?.sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
  return caja;
}

export async function listarCajas(): Promise<Caja[]> {
  const cajas = await cajaRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
  return cajas.map(ordenarMovimientos);
}

export async function obtenerCaja(id: string): Promise<Caja> {
  const caja = await cajaRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!caja) {
    throw new HttpError(404, 'Caja no encontrada');
  }
  return ordenarMovimientos(caja);
}

export async function obtenerCajaAbierta(): Promise<Caja | null> {
  const caja = await cajaRepository.findOne({
    where: { estado: EstadoCaja.ABIERTA },
    relations: RELACIONES,
  });
  return caja ? ordenarMovimientos(caja) : null;
}

async function resolverUsuario(usuarioId: string) {
  const usuario = await usuarioRepository.findOne({
    where: { id: usuarioId },
    relations: { personal: true },
  });
  if (!usuario) {
    throw new HttpError(401, 'Usuario no encontrado');
  }
  return usuario;
}

/** Suma de ventas emitidas en efectivo dentro del rango de una sesión de caja. No se agrega
 * un `caja_id` a Ventas para no tocar ese módulo (Regla 3 de CLAUDE.md): basta con el rango
 * de fecha de la sesión y el medio de pago para reconstruir el efectivo esperado al cerrar. */
async function calcularVentasEfectivo(desde: Date, hasta: Date): Promise<number> {
  const medioEfectivo = await medioPagoRepository.findOneBy({
    codigo: CODIGO_MEDIO_PAGO_EFECTIVO,
  });
  if (!medioEfectivo) return 0;

  const ventas = await ventaRepository.find({
    where: {
      estado: EstadoVenta.EMITIDA,
      medioPago: { id: medioEfectivo.id },
      creadoEn: Between(desde, hasta),
    },
  });
  // La propina no es parte de `venta.total` (no paga IGV, ver `venta.entity.ts`), pero si se
  // cobró en efectivo es plata física que entró a la caja igual que el resto de la venta.
  return ventas.reduce((suma, venta) => suma + venta.total + venta.propina, 0);
}

/**
 * Suma de cobros en efectivo de ventas al crédito (`PagoVenta`) dentro del rango de una
 * sesión de caja. Sin esto, un cliente que paga su deuda en efectivo mete plata física al
 * cajón que el arqueo nunca contaba — el cierre siempre daba sobrante por esa diferencia.
 * Mismo criterio de "por rango de fecha, sin `caja_id`" que `calcularVentasEfectivo`, y misma
 * razón (Regla 3 de CLAUDE.md: no tocar Cobranzas para agregarle esa columna).
 */
async function calcularPagosCreditoEfectivo(desde: Date, hasta: Date): Promise<number> {
  const medioEfectivo = await medioPagoRepository.findOneBy({
    codigo: CODIGO_MEDIO_PAGO_EFECTIVO,
  });
  if (!medioEfectivo) return 0;

  const pagos = await pagoVentaRepository.find({
    where: {
      anulado: false,
      medioPago: { id: medioEfectivo.id },
      creadoEn: Between(desde, hasta),
    },
  });
  return pagos.reduce((suma, pago) => suma + pago.monto, 0);
}

/** Efectivo que debería haber en el cajón en este momento — mismo cálculo que congela
 * `cerrarCaja`, reusado también por `registrarMovimiento` para no dejar registrar un egreso
 * mayor a lo que físicamente hay. Necesita `caja.movimientos` cargado. */
async function calcularEfectivoDisponible(caja: Caja, hasta: Date): Promise<number> {
  const ventasEfectivo = await calcularVentasEfectivo(caja.creadoEn, hasta);
  const pagosCreditoEfectivo = await calcularPagosCreditoEfectivo(caja.creadoEn, hasta);
  const ingresos = caja.movimientos
    .filter((m) => m.tipo === TipoMovimientoCaja.INGRESO)
    .reduce((suma, m) => suma + m.monto, 0);
  const egresos = caja.movimientos
    .filter((m) => m.tipo === TipoMovimientoCaja.EGRESO)
    .reduce((suma, m) => suma + m.monto, 0);
  return (
    Math.round(
      (caja.montoApertura + ventasEfectivo + pagosCreditoEfectivo + ingresos - egresos) * 100,
    ) / 100
  );
}

export async function abrirCaja(usuarioId: string, dto: AbrirCajaDto): Promise<Caja> {
  const existente = await cajaRepository.findOneBy({ estado: EstadoCaja.ABIERTA });
  if (existente) {
    throw new HttpError(409, 'Ya hay una caja abierta. Ciérrala antes de abrir otra.');
  }

  const usuario = await resolverUsuario(usuarioId);
  const caja = cajaRepository.create({
    usuarioApertura: usuario,
    montoApertura: dto.montoApertura,
    observacionApertura: dto.observacion ?? null,
    estado: EstadoCaja.ABIERTA,
  });
  const guardada = await cajaRepository.save(caja);
  return obtenerCaja(guardada.id);
}

export async function registrarMovimiento(
  cajaId: string,
  usuarioId: string,
  dto: RegistrarMovimientoDto,
): Promise<Caja> {
  const caja = await cajaRepository.findOne({
    where: { id: cajaId },
    relations: { movimientos: true },
  });
  if (!caja) {
    throw new HttpError(404, 'Caja no encontrada');
  }
  if (caja.estado !== EstadoCaja.ABIERTA) {
    throw new HttpError(400, 'Solo se pueden registrar movimientos en una caja abierta');
  }

  if (dto.tipo === 'egreso') {
    const disponible = await calcularEfectivoDisponible(caja, new Date());
    if (dto.monto > disponible) {
      throw new HttpError(
        400,
        `El egreso (${dto.monto.toFixed(2)}) supera el efectivo disponible en caja (${disponible.toFixed(2)})`,
      );
    }
  }

  const usuario = await resolverUsuario(usuarioId);
  const movimiento = movimientoCajaRepository.create({
    caja,
    usuario,
    tipo: dto.tipo === 'ingreso' ? TipoMovimientoCaja.INGRESO : TipoMovimientoCaja.EGRESO,
    monto: dto.monto,
    concepto: dto.concepto,
  });
  await movimientoCajaRepository.save(movimiento);
  return obtenerCaja(cajaId);
}

export async function cerrarCaja(id: string, usuarioId: string, dto: CerrarCajaDto): Promise<Caja> {
  const caja = await cajaRepository.findOne({ where: { id }, relations: { movimientos: true } });
  if (!caja) {
    throw new HttpError(404, 'Caja no encontrada');
  }
  if (caja.estado !== EstadoCaja.ABIERTA) {
    throw new HttpError(400, 'Esta caja ya está cerrada');
  }

  const usuario = await resolverUsuario(usuarioId);
  const fechaCierre = new Date();
  const montoEsperado = await calcularEfectivoDisponible(caja, fechaCierre);
  const diferencia = Math.round((dto.montoDeclarado - montoEsperado) * 100) / 100;

  caja.usuarioCierre = usuario;
  caja.montoEsperado = montoEsperado;
  caja.montoDeclarado = dto.montoDeclarado;
  caja.diferencia = diferencia;
  caja.observacionCierre = dto.observacion ?? null;
  caja.estado = EstadoCaja.CERRADA;
  caja.fechaCierre = fechaCierre;
  await cajaRepository.save(caja);

  return obtenerCaja(id);
}
