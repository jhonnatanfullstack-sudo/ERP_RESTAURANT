import { HttpError } from '../../utils/http-error';
import { marcaRepository } from './marca.repository';
import { productoRepository } from '../productos/producto.repository';
import type { ActualizarMarcaDto, CrearMarcaDto } from './marca.dto';
import type { Marca } from './marca.entity';

export async function listarMarcas(): Promise<Marca[]> {
  return marcaRepository.find({ order: { nombre: 'ASC' } });
}

export async function obtenerMarca(id: string): Promise<Marca> {
  const marca = await marcaRepository.findOneBy({ id });
  if (!marca) {
    throw new HttpError(404, 'Marca no encontrada');
  }
  return marca;
}

export async function crearMarca(dto: CrearMarcaDto): Promise<Marca> {
  const existente = await marcaRepository.findOneBy({ nombre: dto.nombre });
  if (existente) {
    throw new HttpError(409, 'Ya existe una marca con ese nombre');
  }

  const marca = marcaRepository.create(dto);
  return marcaRepository.save(marca);
}

export async function actualizarMarca(id: string, dto: ActualizarMarcaDto): Promise<Marca> {
  const marca = await obtenerMarca(id);

  if (dto.nombre && dto.nombre !== marca.nombre) {
    const existente = await marcaRepository.findOneBy({ nombre: dto.nombre });
    if (existente) {
      throw new HttpError(409, 'Ya existe una marca con ese nombre');
    }
  }

  Object.assign(marca, dto);
  return marcaRepository.save(marca);
}

export async function eliminarMarca(id: string): Promise<void> {
  const marca = await obtenerMarca(id);
  const productosConEstaMarca = await productoRepository.countBy({ marca: { id } });
  if (productosConEstaMarca > 0) {
    throw new HttpError(409, 'No se puede eliminar: hay productos con esta marca');
  }
  await marcaRepository.remove(marca);
}
