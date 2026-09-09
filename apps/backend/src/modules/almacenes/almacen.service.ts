import { HttpError } from '../../utils/http-error';
import { empresaRepository } from '../empresa/empresa.repository';
import { existenciaRepository } from '../inventario/existencia.repository';
import { almacenRepository } from './almacen.repository';
import type { ActualizarAlmacenDto, CrearAlmacenDto } from './almacen.dto';
import type { Almacen } from './almacen.entity';

const RELACIONES = { empresa: true } as const;

export async function listarAlmacenes(): Promise<Almacen[]> {
  return almacenRepository.find({ relations: RELACIONES, order: { nombre: 'ASC' } });
}

export async function obtenerAlmacen(id: string): Promise<Almacen> {
  const almacen = await almacenRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!almacen) {
    throw new HttpError(404, 'Almacén no encontrado');
  }
  return almacen;
}

/** Almacén por defecto de una empresa: destino/origen de los movimientos automáticos
 * (consumo de cocina, venta directa) cuando el llamador no elige uno explícitamente. Usado
 * por `modules/inventario`. */
export async function obtenerAlmacenPrincipal(empresaId: string): Promise<Almacen | null> {
  return almacenRepository.findOne({ where: { empresa: { id: empresaId }, esPrincipal: true } });
}

/** Quita la marca de principal a cualquier otro almacén de la misma empresa — se llama antes
 * de guardar uno nuevo marcado como principal, para que la operación se sienta como "mover"
 * la marca en vez de fallar por el índice único parcial (`IDX_un_almacen_principal_por_empresa`). */
async function despriorizarOtros(empresaId: string, exceptoId?: string): Promise<void> {
  const query = almacenRepository
    .createQueryBuilder()
    .update()
    .set({ esPrincipal: false })
    .where('empresa_id = :empresaId', { empresaId })
    .andWhere('es_principal = true');
  if (exceptoId) {
    query.andWhere('id != :exceptoId', { exceptoId });
  }
  await query.execute();
}

export async function crearAlmacen(dto: CrearAlmacenDto): Promise<Almacen> {
  const empresa = await empresaRepository.findOneBy({ id: dto.empresaId });
  if (!empresa) {
    throw new HttpError(400, 'La empresa indicada no existe', ['empresaId inválido']);
  }

  if (dto.esPrincipal) {
    await despriorizarOtros(empresa.id);
  }

  const almacen = almacenRepository.create({
    empresa,
    nombre: dto.nombre,
    direccion: dto.direccion ?? null,
    esPrincipal: dto.esPrincipal ?? false,
  });
  const guardado = await almacenRepository.save(almacen);
  return obtenerAlmacen(guardado.id);
}

export async function actualizarAlmacen(id: string, dto: ActualizarAlmacenDto): Promise<Almacen> {
  const almacen = await obtenerAlmacen(id);

  if (dto.esPrincipal) {
    await despriorizarOtros(almacen.empresa.id, id);
  }

  if (dto.nombre !== undefined) almacen.nombre = dto.nombre;
  if (dto.direccion !== undefined) almacen.direccion = dto.direccion;
  if (dto.esPrincipal !== undefined) almacen.esPrincipal = dto.esPrincipal;
  if (dto.activo !== undefined) almacen.activo = dto.activo;

  await almacenRepository.save(almacen);
  return obtenerAlmacen(id);
}

export async function eliminarAlmacen(id: string): Promise<void> {
  const almacen = await obtenerAlmacen(id);
  // La FK de `existencias.almacen_id` es RESTRICT: si tiene movimientos, Postgres ya rechaza
  // el borrado — este pre-check solo evita que esa violación llegue como un 500 sin explicar.
  const tieneMovimientos = await existenciaRepository.countBy({ almacen: { id } });
  if (tieneMovimientos > 0) {
    throw new HttpError(409, 'No se puede eliminar: el almacén tiene movimientos registrados');
  }
  await almacenRepository.remove(almacen);
}
