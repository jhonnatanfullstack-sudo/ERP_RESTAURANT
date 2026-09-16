import type { EntityManager } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { formatearNumeroComprobante } from '../../utils/comprobante';
import { empresaRepository } from '../empresa/empresa.repository';
import { almacenRepository } from '../almacenes/almacen.repository';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { tipoComprobanteRepository } from '../catalogos/catalogos.repository';
import { LETRA_SERIE_POR_COMPROBANTE } from '../catalogos/codigos-sunat';
import { ventaRepository } from '../ventas/venta.repository';
import { Venta } from '../ventas/venta.entity';
import { talonarioRepository, talonarioUsuarioRepository } from './talonario.repository';
import { Talonario } from './talonario.entity';
import type {
  ActualizarTalonarioDto,
  AsignarUsuariosDto,
  CrearTalonarioDto,
} from './talonario.dto';
import type { TipoComprobante } from '../catalogos/tipo-comprobante.entity';

const RELACIONES = {
  empresa: true,
  tipoComprobante: true,
  almacen: true,
  usuarios: { usuario: { personal: true } },
} as const;

/** Talonario tal como lo consume la interfaz: además de sus datos guardados lleva el número
 * que le tocaría al próximo comprobante, ya formateado, y cuántos le quedan por emitir. */
export interface TalonarioVista extends Talonario {
  siguienteNumero: number;
  siguienteNumeroFormateado: string;
  numerosDisponibles: number;
  agotado: boolean;
}

/**
 * Número que le corresponde al próximo comprobante de un talonario.
 *
 * Es el siguiente al último emitido, pero nunca por debajo del inicio del rango autorizado
 * (un talonario nuevo, con `numeroActual = 0`, arranca en `numeroInicio`). `ultimoEnVentas`
 * cubre las ventas emitidas antes de existir este módulo, cuando la serie era fija por tipo
 * de comprobante: si alguna ya usó un número igual o mayor, el talonario continúa después de
 * ella en vez de chocar contra el índice único de `ventas (tipo_comprobante, serie, numero)`.
 */
/** Exportada para que otros módulos con su propio correlativo por talonario (ej.
 * `guias-remision`) calculen el siguiente número con la misma regla, sin duplicarla. */
export function calcularSiguienteNumero(talonario: Talonario, ultimoEnVentas: number): number {
  return Math.max(talonario.numeroActual + 1, talonario.numeroInicio, ultimoEnVentas + 1);
}

/** Mayor correlativo ya usado en `ventas` por cada par (tipo de comprobante, serie). */
async function ultimosNumerosEnVentas(talonarios: Talonario[]): Promise<Map<string, number>> {
  const resultado = new Map<string, number>();
  if (talonarios.length === 0) return resultado;

  const filas = await ventaRepository
    .createQueryBuilder('venta')
    .select('venta.tipo_comprobante_id', 'tipoComprobanteId')
    .addSelect('venta.serie', 'serie')
    .addSelect('MAX(venta.numero)', 'ultimo')
    .where('venta.serie IN (:...series)', {
      series: [...new Set(talonarios.map((t) => t.serie))],
    })
    .groupBy('venta.tipo_comprobante_id')
    .addGroupBy('venta.serie')
    .getRawMany<{ tipoComprobanteId: string; serie: string; ultimo: string }>();

  for (const fila of filas) {
    resultado.set(`${fila.tipoComprobanteId}|${fila.serie}`, Number(fila.ultimo));
  }
  return resultado;
}

async function aVista(talonarios: Talonario[]): Promise<TalonarioVista[]> {
  const ultimos = await ultimosNumerosEnVentas(talonarios);
  return talonarios.map((talonario) => {
    const ultimoEnVentas = ultimos.get(`${talonario.tipoComprobante.id}|${talonario.serie}`) ?? 0;
    const siguienteNumero = calcularSiguienteNumero(talonario, ultimoEnVentas);
    return Object.assign(talonario, {
      siguienteNumero,
      siguienteNumeroFormateado: formatearNumeroComprobante(talonario.serie, siguienteNumero),
      numerosDisponibles: Math.max(0, talonario.numeroFin - siguienteNumero + 1),
      agotado: siguienteNumero > talonario.numeroFin,
    });
  });
}

export async function listarTalonarios(): Promise<TalonarioVista[]> {
  const talonarios = await talonarioRepository.find({
    relations: RELACIONES,
    order: { serie: 'ASC' },
  });
  return aVista(talonarios);
}

export async function obtenerTalonario(id: string): Promise<Talonario> {
  const talonario = await talonarioRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!talonario) {
    throw new HttpError(404, 'Talonario no encontrado');
  }
  return talonario;
}

/** Igual que `obtenerTalonario` pero con los campos calculados (siguiente número, restantes):
 * es el shape que devuelve la API, para que un talonario suelto y uno del listado se lean
 * exactamente igual desde el frontend. */
export async function obtenerTalonarioVista(id: string): Promise<TalonarioVista> {
  const vistas = await aVista([await obtenerTalonario(id)]);
  return vistas[0] as TalonarioVista;
}

/** La serie debe empezar con la letra que SUNAT exige para ese comprobante (F factura,
 * B boleta); para el resto de comprobantes no hay letra reservada y se acepta cualquiera. */
function validarSerie(serie: string, tipoComprobante: TipoComprobante): void {
  const letra = LETRA_SERIE_POR_COMPROBANTE[tipoComprobante.codigo];
  if (letra && !serie.startsWith(letra)) {
    throw new HttpError(
      400,
      `La serie de una ${tipoComprobante.nombre.toLowerCase()} debe empezar con "${letra}"`,
      ['serie inválida'],
    );
  }
}

/** El índice único `(empresa, serie)` ya lo impide en base de datos; este pre-check evita que
 * la violación llegue como un 500 sin explicación. */
async function verificarSerieLibre(
  empresaId: string,
  serie: string,
  exceptoId?: string,
): Promise<void> {
  const existente = await talonarioRepository.findOne({
    where: { empresa: { id: empresaId }, serie },
  });
  if (existente && existente.id !== exceptoId) {
    throw new HttpError(409, `Ya existe un talonario con la serie ${serie}`);
  }
}

export async function crearTalonario(dto: CrearTalonarioDto): Promise<TalonarioVista> {
  const empresa = await empresaRepository.findOneBy({ id: dto.empresaId });
  if (!empresa) {
    throw new HttpError(400, 'La empresa indicada no existe', ['empresaId inválido']);
  }

  const tipoComprobante = await tipoComprobanteRepository.findOneBy({ id: dto.tipoComprobanteId });
  if (!tipoComprobante) {
    throw new HttpError(400, 'El tipo de comprobante indicado no existe', [
      'tipoComprobanteId inválido',
    ]);
  }

  const almacen = await almacenRepository.findOneBy({ id: dto.almacenId });
  if (!almacen) {
    throw new HttpError(400, 'El almacén indicado no existe', ['almacenId inválido']);
  }

  validarSerie(dto.serie, tipoComprobante);
  await verificarSerieLibre(empresa.id, dto.serie);

  const talonario = talonarioRepository.create({
    empresa,
    tipoComprobante,
    almacen,
    serie: dto.serie,
    numeroInicio: dto.numeroInicio,
    numeroFin: dto.numeroFin,
    numeroActual: dto.numeroActual ?? 0,
  });
  const guardado = await talonarioRepository.save(talonario);

  if (dto.usuarioIds?.length) {
    return asignarUsuarios(guardado.id, { usuarioIds: dto.usuarioIds });
  }

  return obtenerTalonarioVista(guardado.id);
}

export async function actualizarTalonario(
  id: string,
  dto: ActualizarTalonarioDto,
): Promise<TalonarioVista> {
  const talonario = await obtenerTalonario(id);

  if (dto.almacenId) {
    const almacen = await almacenRepository.findOneBy({ id: dto.almacenId });
    if (!almacen) {
      throw new HttpError(400, 'El almacén indicado no existe', ['almacenId inválido']);
    }
    talonario.almacen = almacen;
  }

  if (dto.serie !== undefined && dto.serie !== talonario.serie) {
    // Cambiar la serie de un talonario que ya emitió dejaría comprobantes suyos numerados con
    // una serie que ya no le pertenece: solo se permite mientras no haya emitido nada.
    if (talonario.numeroActual > 0) {
      throw new HttpError(409, 'No se puede cambiar la serie de un talonario que ya emitió');
    }
    validarSerie(dto.serie, talonario.tipoComprobante);
    await verificarSerieLibre(talonario.empresa.id, dto.serie, id);
    talonario.serie = dto.serie;
  }

  if (dto.numeroInicio !== undefined) talonario.numeroInicio = dto.numeroInicio;
  if (dto.numeroFin !== undefined) talonario.numeroFin = dto.numeroFin;
  if (dto.numeroActual !== undefined) talonario.numeroActual = dto.numeroActual;
  if (dto.activo !== undefined) talonario.activo = dto.activo;

  if (talonario.numeroFin < talonario.numeroInicio) {
    throw new HttpError(400, 'El número final debe ser mayor o igual al número inicial', [
      'numeroFin inválido',
    ]);
  }

  await talonarioRepository.save(talonario);
  return obtenerTalonarioVista(id);
}

export async function eliminarTalonario(id: string): Promise<void> {
  const talonario = await obtenerTalonario(id);

  // La FK de `ventas.talonario_id` es RESTRICT: este pre-check solo convierte esa violación
  // en un mensaje entendible. Un talonario que ya emitió se desactiva, no se borra.
  const tieneVentas = await ventaRepository.countBy({ talonario: { id } });
  if (tieneVentas > 0) {
    throw new HttpError(
      409,
      'No se puede eliminar: el talonario ya tiene comprobantes emitidos. Desactívalo en su lugar.',
    );
  }

  // Las asignaciones caen junto al talonario (FK CASCADE): no bloquean el borrado.
  await talonarioRepository.remove(talonario);
}

/** Reemplaza por completo el conjunto de usuarios asignados, igual que los permisos de un rol. */
export async function asignarUsuarios(
  id: string,
  dto: AsignarUsuariosDto,
): Promise<TalonarioVista> {
  const talonario = await obtenerTalonario(id);
  const idsUnicos = [...new Set(dto.usuarioIds)];

  const usuarios = idsUnicos.length
    ? await usuarioRepository.find({ where: idsUnicos.map((usuarioId) => ({ id: usuarioId })) })
    : [];
  if (usuarios.length !== idsUnicos.length) {
    throw new HttpError(400, 'Uno de los usuarios indicados no existe', ['usuarioIds inválido']);
  }

  await talonarioUsuarioRepository.delete({ talonario: { id } });
  if (usuarios.length) {
    await talonarioUsuarioRepository.save(
      usuarios.map((usuario) => talonarioUsuarioRepository.create({ talonario, usuario })),
    );
  }

  return obtenerTalonarioVista(id);
}

/** Talonarios activos asignados a un usuario, agotados incluidos. Interno: la interfaz usa
 * `listarTalonariosDeUsuario`, que descarta los agotados; el resolutor de la venta necesita
 * verlos igual para distinguir "no tiene talonarios" de "los tiene, pero se acabaron". */
async function talonariosAsignados(
  usuarioId: string,
  tipoComprobanteId?: string,
): Promise<TalonarioVista[]> {
  const asignaciones = await talonarioUsuarioRepository.find({
    where: { usuario: { id: usuarioId } },
    relations: { talonario: { empresa: true, tipoComprobante: true, almacen: true } },
  });

  const talonarios = asignaciones
    .map((asignacion) => asignacion.talonario)
    .filter(
      (talonario) =>
        talonario.activo &&
        (!tipoComprobanteId || talonario.tipoComprobante.id === tipoComprobanteId),
    )
    .sort((a, b) => a.serie.localeCompare(b.serie));

  return aVista(talonarios);
}

/**
 * Talonarios que un usuario puede usar, opcionalmente acotados a un tipo de comprobante. Es
 * lo que alimenta el selector de la pantalla de Ventas: solo los asignados a quien registra
 * la venta, y nunca uno agotado (no queda ningún número por emitir en él).
 */
export async function listarTalonariosDeUsuario(
  usuarioId: string,
  tipoComprobanteId?: string,
): Promise<TalonarioVista[]> {
  const asignados = await talonariosAsignados(usuarioId, tipoComprobanteId);
  return asignados.filter((vista) => !vista.agotado);
}

/**
 * Talonario con el que se numerará una venta. Devuelve `null` solo cuando el usuario no tiene
 * NINGÚN talonario asignado para ese comprobante: en ese caso Ventas mantiene la numeración
 * anterior al módulo (serie fija por tipo de comprobante), para no dejar sin facturar a una
 * instalación que todavía no configuró talonarios.
 *
 * Tener talonarios y que estén agotados no es ese caso: ahí la venta falla pidiendo registrar
 * un talonario nuevo, en vez de emitir a escondidas con una serie que no es la del cajero.
 */
export async function resolverTalonarioParaVenta(
  usuarioId: string,
  tipoComprobante: TipoComprobante,
  talonarioId?: string,
): Promise<Talonario | null> {
  const asignados = await talonariosAsignados(usuarioId, tipoComprobante.id);

  if (talonarioId) {
    const elegido = asignados.find((talonario) => talonario.id === talonarioId);
    if (!elegido) {
      throw new HttpError(
        400,
        'El talonario indicado no está disponible para este usuario y tipo de comprobante',
        ['talonarioId inválido'],
      );
    }
    if (elegido.agotado) {
      throw new HttpError(409, mensajeAgotado(elegido));
    }
    return elegido;
  }

  if (asignados.length === 0) return null;

  const disponibles = asignados.filter((talonario) => !talonario.agotado);
  if (disponibles.length === 0) {
    throw new HttpError(409, mensajeAgotado(asignados[0] as TalonarioVista));
  }
  if (disponibles.length > 1) {
    throw new HttpError(400, 'Tienes varios talonarios para este comprobante: elige uno', [
      'talonarioId requerido',
    ]);
  }
  return disponibles[0] as Talonario;
}

function mensajeAgotado(talonario: Talonario): string {
  return `El talonario ${talonario.serie} llegó a su último número autorizado (${talonario.numeroFin}). Registra un talonario nuevo.`;
}

/**
 * Toma el siguiente número del talonario y lo consume, dentro de la transacción de la venta.
 *
 * El `SELECT … FOR UPDATE` serializa a dos cajeros que emitan a la vez desde la misma serie:
 * el segundo espera a que el primero confirme y recién entonces lee el correlativo ya
 * actualizado. Sin ese bloqueo ambos leerían el mismo número y uno de los dos moriría contra
 * el índice único de `ventas`.
 */
export async function reservarNumero(
  manager: EntityManager,
  talonarioId: string,
): Promise<{ serie: string; numero: number }> {
  // Sin `relations`: un LEFT JOIN convertiría el FOR UPDATE en un error de Postgres
  // ("FOR UPDATE cannot be applied to the nullable side of an outer join").
  const talonario = await manager.findOne(Talonario, {
    where: { id: talonarioId },
    lock: { mode: 'pessimistic_write' },
  });
  if (!talonario) {
    throw new HttpError(400, 'El talonario indicado no existe', ['talonarioId inválido']);
  }
  if (!talonario.activo) {
    throw new HttpError(400, `El talonario ${talonario.serie} está inactivo`);
  }

  const fila = await manager
    .createQueryBuilder(Venta, 'venta')
    .select('MAX(venta.numero)', 'ultimo')
    .where('venta.serie = :serie', { serie: talonario.serie })
    .getRawOne<{ ultimo: string | null }>();
  const numero = calcularSiguienteNumero(talonario, Number(fila?.ultimo ?? 0));

  if (numero > talonario.numeroFin) {
    throw new HttpError(409, mensajeAgotado(talonario));
  }

  await manager.update(Talonario, talonario.id, { numeroActual: numero });
  return { serie: talonario.serie, numero };
}
