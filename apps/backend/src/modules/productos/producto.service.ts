import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpError } from '../../utils/http-error';
import { categoriaRepository } from '../categorias/categoria.repository';
import { productoRepository } from './producto.repository';
import { UPLOADS_DIR } from '../../config/uploads';
import type { ActualizarProductoDto, CrearProductoDto } from './producto.dto';
import type { Producto } from './producto.entity';

const RELACIONES = { categoria: true } as const;

export async function listarProductos(): Promise<Producto[]> {
  return productoRepository.find({ relations: RELACIONES, order: { nombre: 'ASC' } });
}

export async function listarProductosPublico(): Promise<Producto[]> {
  return productoRepository.find({
    where: { activo: true, categoria: { activo: true } },
    relations: RELACIONES,
    order: { nombre: 'ASC' },
  });
}

export async function obtenerProducto(id: string): Promise<Producto> {
  const producto = await productoRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!producto) {
    throw new HttpError(404, 'Producto no encontrado');
  }
  return producto;
}

async function resolverCategoria(categoriaId: string) {
  const categoria = await categoriaRepository.findOneBy({ id: categoriaId });
  if (!categoria) {
    throw new HttpError(400, 'La categoría indicada no existe', ['categoriaId inválido']);
  }
  return categoria;
}

export async function crearProducto(dto: CrearProductoDto): Promise<Producto> {
  const categoria = await resolverCategoria(dto.categoriaId);
  const producto = productoRepository.create({
    categoria,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? null,
    precio: dto.precio,
  });
  const guardado = await productoRepository.save(producto);
  return obtenerProducto(guardado.id);
}

export async function actualizarProducto(
  id: string,
  dto: ActualizarProductoDto,
): Promise<Producto> {
  const producto = await obtenerProducto(id);

  if (dto.categoriaId) {
    producto.categoria = await resolverCategoria(dto.categoriaId);
  }
  if (dto.nombre !== undefined) producto.nombre = dto.nombre;
  if (dto.descripcion !== undefined) producto.descripcion = dto.descripcion;
  if (dto.precio !== undefined) producto.precio = dto.precio;
  if (dto.activo !== undefined) producto.activo = dto.activo;

  await productoRepository.save(producto);
  return obtenerProducto(id);
}

async function eliminarArchivoImagen(imagenUrl: string | null): Promise<void> {
  if (!imagenUrl) return;
  const nombreArchivo = imagenUrl.split('/').pop();
  if (!nombreArchivo) return;
  await unlink(join(UPLOADS_DIR, 'productos', nombreArchivo)).catch(() => undefined);
}

export async function eliminarProducto(id: string): Promise<void> {
  const producto = await obtenerProducto(id);
  await productoRepository.remove(producto);
  await eliminarArchivoImagen(producto.imagenUrl);
}

export async function actualizarImagenProducto(
  id: string,
  archivo: Express.Multer.File,
): Promise<Producto> {
  const producto = await obtenerProducto(id);
  await eliminarArchivoImagen(producto.imagenUrl);
  producto.imagenUrl = `/uploads/productos/${archivo.filename}`;
  await productoRepository.save(producto);
  return obtenerProducto(id);
}
