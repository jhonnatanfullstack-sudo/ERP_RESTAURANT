import { HttpError } from '../../utils/http-error';
import { categoriaRepository } from './categoria.repository';
import { productoRepository } from '../productos/producto.repository';
import type { ActualizarCategoriaDto, CrearCategoriaDto } from './categoria.dto';
import type { Categoria } from './categoria.entity';

export async function listarCategorias(): Promise<Categoria[]> {
  return categoriaRepository.find({ order: { nombre: 'ASC' } });
}

export async function obtenerCategoria(id: string): Promise<Categoria> {
  const categoria = await categoriaRepository.findOneBy({ id });
  if (!categoria) {
    throw new HttpError(404, 'Categoría no encontrada');
  }
  return categoria;
}

export async function crearCategoria(dto: CrearCategoriaDto): Promise<Categoria> {
  const existente = await categoriaRepository.findOneBy({ nombre: dto.nombre });
  if (existente) {
    throw new HttpError(409, 'Ya existe una categoría con ese nombre');
  }

  const categoria = categoriaRepository.create(dto);
  return categoriaRepository.save(categoria);
}

export async function actualizarCategoria(
  id: string,
  dto: ActualizarCategoriaDto,
): Promise<Categoria> {
  const categoria = await obtenerCategoria(id);

  if (dto.nombre && dto.nombre !== categoria.nombre) {
    const existente = await categoriaRepository.findOneBy({ nombre: dto.nombre });
    if (existente) {
      throw new HttpError(409, 'Ya existe una categoría con ese nombre');
    }
  }

  Object.assign(categoria, dto);
  return categoriaRepository.save(categoria);
}

export async function eliminarCategoria(id: string): Promise<void> {
  const categoria = await obtenerCategoria(id);
  const productosConEstaCategoria = await productoRepository.countBy({ categoria: { id } });
  if (productosConEstaCategoria > 0) {
    throw new HttpError(409, 'No se puede eliminar: hay productos en esta categoría');
  }
  await categoriaRepository.remove(categoria);
}
