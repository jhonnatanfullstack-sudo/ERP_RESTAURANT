import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpError } from '../../utils/http-error';
import { categoriaRepository } from '../categorias/categoria.repository';
import { marcaRepository } from '../marcas/marca.repository';
import {
  tipoAfectacionIgvRepository,
  unidadMedidaRepository,
} from '../catalogos/catalogos.repository';
import { productoRepository } from './producto.repository';
import { UPLOADS_DIR } from '../../config/uploads';
import { TipoProducto } from './producto.entity';
import { reemplazarReceta } from '../recetas/receta.service';
import type { ActualizarProductoDto, CrearProductoDto } from './producto.dto';
import type { Producto } from './producto.entity';

const RELACIONES = {
  categoria: true,
  marca: true,
  unidadMedida: true,
  tipoAfectacionIgv: true,
} as const;

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

async function resolverMarca(marcaId: string | null | undefined) {
  if (!marcaId) return null;
  const marca = await marcaRepository.findOneBy({ id: marcaId });
  if (!marca) {
    throw new HttpError(400, 'La marca indicada no existe', ['marcaId inválido']);
  }
  return marca;
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

export async function crearProducto(dto: CrearProductoDto): Promise<Producto> {
  const categoria = await resolverCategoria(dto.categoriaId);
  const marca = await resolverMarca(dto.marcaId);
  const unidadMedida = await resolverUnidadMedida(dto.unidadMedidaId);
  const tipoAfectacionIgv = await resolverTipoAfectacionIgv(dto.tipoAfectacionIgvId);
  const tipo = dto.tipo ?? TipoProducto.SERVICIO;
  const producto = productoRepository.create({
    categoria,
    marca,
    unidadMedida,
    tipoAfectacionIgv,
    tipo,
    nombre: dto.nombre,
    descripcion: dto.descripcion ?? null,
    precio: dto.precio,
  });
  const guardado = await productoRepository.save(producto);

  // La receta solo tiene sentido para un producto que se prepara — se ignora en silencio
  // para `mercaderia` en vez de rechazar la creación por un campo que no aplicaba.
  if (dto.receta && tipo === TipoProducto.SERVICIO) {
    await reemplazarReceta(guardado.id, dto.receta);
  }

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
  if (dto.marcaId !== undefined) {
    producto.marca = await resolverMarca(dto.marcaId);
  }
  if (dto.unidadMedidaId) {
    producto.unidadMedida = await resolverUnidadMedida(dto.unidadMedidaId);
  }
  if (dto.tipoAfectacionIgvId) {
    producto.tipoAfectacionIgv = await resolverTipoAfectacionIgv(dto.tipoAfectacionIgvId);
  }
  if (dto.tipo !== undefined) producto.tipo = dto.tipo;
  if (dto.nombre !== undefined) producto.nombre = dto.nombre;
  if (dto.descripcion !== undefined) producto.descripcion = dto.descripcion;
  if (dto.precio !== undefined) producto.precio = dto.precio;
  if (dto.activo !== undefined) producto.activo = dto.activo;

  await productoRepository.save(producto);

  if (dto.receta && producto.tipo === TipoProducto.SERVICIO) {
    await reemplazarReceta(id, dto.receta);
  }

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
