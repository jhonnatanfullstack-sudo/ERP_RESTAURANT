import { HttpError } from '../../utils/http-error';
import {
  tipoAfectacionIgvRepository,
  unidadMedidaRepository,
} from '../catalogos/catalogos.repository';
import { obtenerUltimosCostosInsumos } from '../inventario/existencia.service';
import { insumoRepository } from './insumo.repository';
import type { ActualizarInsumoDto, CrearInsumoDto } from './insumo.dto';
import type { Insumo } from './insumo.entity';

const RELACIONES = { unidadMedida: true, tipoAfectacionIgv: true } as const;

/** Insumo con su último costo de compra conocido (`costoUnitario` del movimiento de entrada
 * más reciente en `existencias`, cualquier almacén) — informativo, para estimar el costo de
 * una receta; `null` si nunca se compró o se compró sin registrar costo. */
export type InsumoConCosto = Insumo & { ultimoCosto: number | null };

export async function listarInsumos(): Promise<InsumoConCosto[]> {
  const [insumos, costos] = await Promise.all([
    insumoRepository.find({ relations: RELACIONES, order: { nombre: 'ASC' } }),
    obtenerUltimosCostosInsumos(),
  ]);
  return insumos.map((insumo) => ({ ...insumo, ultimoCosto: costos.get(insumo.id) ?? null }));
}

export async function obtenerInsumo(id: string): Promise<Insumo> {
  const insumo = await insumoRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!insumo) {
    throw new HttpError(404, 'Insumo no encontrado');
  }
  return insumo;
}

async function resolverUnidadMedida(unidadMedidaId: string) {
  const unidadMedida = await unidadMedidaRepository.findOneBy({ id: unidadMedidaId });
  if (!unidadMedida) {
    throw new HttpError(400, 'La unidad de medida indicada no existe', ['unidadMedidaId inválido']);
  }
  return unidadMedida;
}

async function resolverTipoAfectacionIgv(tipoAfectacionIgvId: string) {
  const tipoAfectacionIgv = await tipoAfectacionIgvRepository.findOneBy({
    id: tipoAfectacionIgvId,
  });
  if (!tipoAfectacionIgv) {
    throw new HttpError(400, 'El tipo de afectación del IGV indicado no existe', [
      'tipoAfectacionIgvId inválido',
    ]);
  }
  return tipoAfectacionIgv;
}

export async function crearInsumo(dto: CrearInsumoDto): Promise<Insumo> {
  const existente = await insumoRepository.findOneBy({ nombre: dto.nombre });
  if (existente) {
    throw new HttpError(409, 'Ya existe un insumo con ese nombre');
  }
  const unidadMedida = await resolverUnidadMedida(dto.unidadMedidaId);
  const tipoAfectacionIgv = await resolverTipoAfectacionIgv(dto.tipoAfectacionIgvId);
  const insumo = insumoRepository.create({
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? null,
    unidadMedida,
    tipoAfectacionIgv,
  });
  const guardado = await insumoRepository.save(insumo);
  return obtenerInsumo(guardado.id);
}

export async function actualizarInsumo(id: string, dto: ActualizarInsumoDto): Promise<Insumo> {
  const insumo = await obtenerInsumo(id);

  if (dto.nombre && dto.nombre !== insumo.nombre) {
    const existente = await insumoRepository.findOneBy({ nombre: dto.nombre });
    if (existente) {
      throw new HttpError(409, 'Ya existe un insumo con ese nombre');
    }
    insumo.nombre = dto.nombre;
  }
  if (dto.unidadMedidaId) {
    insumo.unidadMedida = await resolverUnidadMedida(dto.unidadMedidaId);
  }
  if (dto.tipoAfectacionIgvId) {
    insumo.tipoAfectacionIgv = await resolverTipoAfectacionIgv(dto.tipoAfectacionIgvId);
  }
  if (dto.descripcion !== undefined) insumo.descripcion = dto.descripcion;
  if (dto.activo !== undefined) insumo.activo = dto.activo;

  await insumoRepository.save(insumo);
  return obtenerInsumo(id);
}

/** Borrado lógico (`activo = false`), no borrado real: un insumo ya puede tener movimientos
 * en `existencias` o estar referenciado por la receta de un producto — perderlo rompería ese
 * historial. Mismo criterio que Usuarios/Personal/Clientes. */
export async function desactivarInsumo(id: string): Promise<void> {
  const insumo = await obtenerInsumo(id);
  insumo.activo = false;
  await insumoRepository.save(insumo);
}
