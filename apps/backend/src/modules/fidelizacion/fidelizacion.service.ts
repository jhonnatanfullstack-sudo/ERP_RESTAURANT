import { In } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { clienteRepository } from '../clientes/cliente.repository';
import { ventaRepository } from '../ventas/venta.repository';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { obtenerConfiguracion } from '../configuracion/configuracion.service';
import { NUMERO_DOCUMENTO_VARIOS } from '../catalogos/codigos-sunat';
import { movimientoFidelizacionRepository } from './fidelizacion.repository';
import { MovimientoFidelizacion, TipoMovimientoFidelizacion } from './movimiento-fidelizacion.entity';
import type { Venta } from '../ventas/venta.entity';
import type { Cliente } from '../clientes/cliente.entity';
import type { AjustarPuntosDto, CanjearPuntosDto } from './fidelizacion.dto';

const RELACIONES = {
  cliente: true,
  venta: { tipoComprobante: true },
  usuario: { personal: true },
} as const;

/** Suma de puntos de un cliente — nunca se guarda aparte, es la suma con signo de sus
 * movimientos (ver `movimiento-fidelizacion.entity.ts`). */
export async function obtenerSaldo(clienteId: string): Promise<number> {
  const resultado: Array<{ saldo: string | null }> = await movimientoFidelizacionRepository.query(
    `SELECT SUM(puntos) AS saldo FROM movimientos_fidelizacion WHERE cliente_id = $1`,
    [clienteId],
  );
  return Number(resultado[0]?.saldo ?? 0);
}

export interface SaldoCliente {
  cliente: Cliente;
  saldo: number;
}

/** Todos los clientes con algún movimiento, con su saldo actual — la lista principal de
 * `/fidelizacion`. */
export async function listarClientesConPuntos(): Promise<SaldoCliente[]> {
  const filas: Array<{ cliente_id: string; saldo: string }> =
    await movimientoFidelizacionRepository.query(
      `SELECT cliente_id, SUM(puntos) AS saldo
       FROM movimientos_fidelizacion
       GROUP BY cliente_id
       ORDER BY SUM(puntos) DESC`,
    );
  if (filas.length === 0) return [];

  const clientes = await clienteRepository.findBy({ id: In(filas.map((f) => f.cliente_id)) });
  const mapaClientes = new Map(clientes.map((c) => [c.id, c]));

  return filas
    .map((fila) => ({ cliente: mapaClientes.get(fila.cliente_id), saldo: Number(fila.saldo) }))
    .filter((item): item is SaldoCliente => item.cliente !== undefined);
}

export async function listarMovimientosCliente(
  clienteId: string,
): Promise<MovimientoFidelizacion[]> {
  return movimientoFidelizacionRepository.find({
    where: { cliente: { id: clienteId } },
    relations: RELACIONES,
    order: { creadoEn: 'DESC' },
  });
}

/**
 * Acredita puntos al emitir una venta con cliente identificado — se llama desde
 * `venta.service.ts: crearVenta` justo después de guardarla. No hace nada (silenciosamente,
 * igual que `existencia.service.ts` sin almacén principal) cuando el programa está apagado, la
 * venta no tiene cliente, o el cliente es el genérico "Clientes Varios": ese registro lo
 * comparten todas las ventas sin cliente real detrás, así que acumularle puntos no
 * representaría a nadie.
 */
export async function acreditarPuntosPorVenta(venta: Venta): Promise<void> {
  const configuracion = await obtenerConfiguracion();
  if (!configuracion.fidelizacionActiva) return;
  if (!venta.cliente || venta.cliente.numeroDocumento === NUMERO_DOCUMENTO_VARIOS) return;

  const puntos = Math.floor(venta.total / configuracion.solesPorPunto);
  if (puntos <= 0) return;

  const movimiento = movimientoFidelizacionRepository.create({
    cliente: venta.cliente,
    tipo: TipoMovimientoFidelizacion.GANADO,
    puntos,
    venta,
    usuario: null,
    observacion: null,
  });
  await movimientoFidelizacionRepository.save(movimiento);
}

async function resolverCliente(clienteId: string): Promise<Cliente> {
  const cliente = await clienteRepository.findOneBy({ id: clienteId });
  if (!cliente) {
    throw new HttpError(400, 'El cliente indicado no existe', ['clienteId inválido']);
  }
  return cliente;
}

export async function canjearPuntos(
  usuarioId: string,
  dto: CanjearPuntosDto,
): Promise<MovimientoFidelizacion> {
  const cliente = await resolverCliente(dto.clienteId);
  const saldo = await obtenerSaldo(cliente.id);
  if (dto.puntos > saldo) {
    throw new HttpError(400, `El cliente solo tiene ${saldo} puntos disponibles`);
  }

  const venta = dto.ventaId ? await ventaRepository.findOneBy({ id: dto.ventaId }) : null;
  if (dto.ventaId && !venta) {
    throw new HttpError(400, 'La venta indicada no existe', ['ventaId inválido']);
  }

  const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
  if (!usuario) {
    throw new HttpError(401, 'Usuario no encontrado');
  }

  const movimiento = movimientoFidelizacionRepository.create({
    cliente,
    tipo: TipoMovimientoFidelizacion.CANJEADO,
    puntos: -dto.puntos,
    venta,
    usuario,
    observacion: dto.observacion ?? null,
  });
  return movimientoFidelizacionRepository.save(movimiento);
}

export async function ajustarPuntos(
  usuarioId: string,
  dto: AjustarPuntosDto,
): Promise<MovimientoFidelizacion> {
  const cliente = await resolverCliente(dto.clienteId);

  if (dto.puntos < 0) {
    const saldo = await obtenerSaldo(cliente.id);
    if (-dto.puntos > saldo) {
      throw new HttpError(400, `El cliente solo tiene ${saldo} puntos disponibles`);
    }
  }

  const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
  if (!usuario) {
    throw new HttpError(401, 'Usuario no encontrado');
  }

  const movimiento = movimientoFidelizacionRepository.create({
    cliente,
    tipo: TipoMovimientoFidelizacion.AJUSTE,
    puntos: dto.puntos,
    venta: null,
    usuario,
    observacion: dto.observacion,
  });
  return movimientoFidelizacionRepository.save(movimiento);
}
