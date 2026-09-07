import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ImagePlus, Package, Pencil, Trash2, UtensilsCrossed } from 'lucide-react';
import * as productosService from '../services/productos.service';
import * as categoriasService from '../services/categorias.service';
import * as marcasService from '../services/marcas.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { formatearPrecio, urlImagen } from '../utils/formato';
import type { ActualizarProductoInput, CrearProductoInput } from '../services/productos.service';
import type { Producto } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

function TarjetaProducto({
  producto,
  puedeEditar,
  puedeEliminar,
  onEditar,
  onEliminar,
}: {
  producto: Producto;
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const imagen = urlImagen(producto.imagenUrl);

  return (
    <div className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-4/3 overflow-hidden bg-zinc-100">
        {imagen ? (
          <img
            src={imagen}
            alt={producto.nombre}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-300">
            <UtensilsCrossed className="h-10 w-10" strokeWidth={1.25} />
          </div>
        )}
        <span className="absolute top-2 left-2">
          <Badge tono="neutral">{producto.categoria.nombre}</Badge>
        </span>
        {!producto.activo && (
          <span className="absolute top-2 right-2">
            <Badge tono="peligro">Inactivo</Badge>
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-zinc-900">{producto.nombre}</h3>
            {producto.marca && <p className="text-xs text-zinc-400">{producto.marca.nombre}</p>}
          </div>
          <span className="shrink-0 font-bold text-orange-600">
            {formatearPrecio(producto.precio)}
          </span>
        </div>
        {producto.descripcion && (
          <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{producto.descripcion}</p>
        )}
        <p className="mt-1 text-xs text-zinc-400">Unidad: {producto.unidadMedida.nombre}</p>

        {(puedeEditar || puedeEliminar) && (
          <div className="mt-3 flex items-center gap-3 border-t border-zinc-100 pt-3">
            {puedeEditar && (
              <button
                type="button"
                onClick={onEditar}
                className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
            )}
            {puedeEliminar && (
              <button
                type="button"
                onClick={onEliminar}
                className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Productos() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const inputImagenRef = useRef<HTMLInputElement>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoEditando, setProductoEditando] = useState<Producto | null>(null);
  const [productoEliminando, setProductoEliminando] = useState<Producto | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas');

  const productosQuery = useQuery({
    queryKey: ['productos'],
    queryFn: productosService.listarProductos,
  });
  const categoriasQuery = useQuery({
    queryKey: ['categorias'],
    queryFn: categoriasService.listarCategorias,
  });
  const marcasQuery = useQuery({ queryKey: ['marcas'], queryFn: marcasService.listarMarcas });
  const unidadesMedidaQuery = useQuery({
    queryKey: ['unidades-medida'],
    queryFn: catalogosService.listarUnidadesMedida,
  });

  const crearForm = useForm<CrearProductoInput>();
  const editarForm = useForm<ActualizarProductoInput>();

  const crearMutation = useMutation({
    mutationFn: productosService.crearProducto,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarProductoInput) =>
      productosService.actualizarProducto(productoEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setProductoEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => productosService.eliminarProducto(productoEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setProductoEliminando(null);
    },
  });

  const subirImagenMutation = useMutation({
    mutationFn: (archivo: File) =>
      productosService.subirImagenProducto(productoEditando!.id, archivo),
    onSuccess: (actualizado) => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setProductoEditando(actualizado);
    },
  });

  if (productosQuery.isLoading) return <Spinner />;

  const productos = productosQuery.data ?? [];
  const productosFiltrados =
    filtroCategoria === 'todas'
      ? productos
      : productos.filter((p) => p.categoria.id === filtroCategoria);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Productos</h1>
          <p className="mt-1 text-sm text-zinc-500">Platillos y productos de la carta</p>
        </div>
        {tienePermiso('productos.crear') && (
          <Button icono={<Package className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nuevo producto
          </Button>
        )}
      </div>

      {categoriasQuery.data && categoriasQuery.data.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFiltroCategoria('todas')}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filtroCategoria === 'todas'
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Todas
          </button>
          {categoriasQuery.data.map((categoria) => (
            <button
              key={categoria.id}
              type="button"
              onClick={() => setFiltroCategoria(categoria.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filtroCategoria === categoria.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {categoria.nombre}
            </button>
          ))}
        </div>
      )}

      {productosFiltrados.length === 0 ? (
        <EmptyState
          icono={UtensilsCrossed}
          titulo="No hay productos registrados"
          descripcion="Crea el primer producto de la carta."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {productosFiltrados.map((producto) => (
            <TarjetaProducto
              key={producto.id}
              producto={producto}
              puedeEditar={tienePermiso('productos.editar')}
              puedeEliminar={tienePermiso('productos.eliminar')}
              onEditar={() => {
                setProductoEditando(producto);
                editarForm.reset({
                  categoriaId: producto.categoria.id,
                  marcaId: producto.marca?.id ?? '',
                  unidadMedidaId: producto.unidadMedida.id,
                  nombre: producto.nombre,
                  descripcion: producto.descripcion ?? '',
                  precio: producto.precio,
                  activo: producto.activo,
                });
              }}
              onEliminar={() => setProductoEliminando(producto)}
            />
          ))}
        </div>
      )}

      <Modal abierto={modalAbierto} titulo="Nuevo producto" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) =>
            crearMutation.mutate({ ...values, marcaId: values.marcaId || null }),
          )}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el producto')}
            />
          )}

          <div>
            <label className={labelClass}>Categoría</label>
            <select
              {...crearForm.register('categoriaId', { required: true })}
              className={inputClass}
            >
              <option value="">Seleccionar…</option>
              {categoriasQuery.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Marca (opcional)</label>
              <select {...crearForm.register('marcaId')} className={inputClass}>
                <option value="">Sin marca</option>
                {marcasQuery.data?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Unidad de medida</label>
              <select
                {...crearForm.register('unidadMedidaId', { required: true })}
                className={inputClass}
              >
                <option value="">Seleccionar…</option>
                {unidadesMedidaQuery.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Nombre</label>
            <input {...crearForm.register('nombre', { required: true })} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <input {...crearForm.register('descripcion')} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Precio (S/.)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              {...crearForm.register('precio', { required: true, valueAsNumber: true })}
              className={inputClass}
            />
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear producto
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={productoEditando !== null}
        titulo="Editar producto"
        onCerrar={() => setProductoEditando(null)}
      >
        {productoEditando && (
          <div className="flex flex-col gap-5">
            <div>
              <label className={labelClass}>Foto del producto</label>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                  {urlImagen(productoEditando.imagenUrl) ? (
                    <img
                      src={urlImagen(productoEditando.imagenUrl)!}
                      alt={productoEditando.nombre}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-300">
                      <UtensilsCrossed className="h-7 w-7" strokeWidth={1.25} />
                    </div>
                  )}
                </div>
                <input
                  ref={inputImagenRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const archivo = e.target.files?.[0];
                    if (archivo) subirImagenMutation.mutate(archivo);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variante="secondary"
                  icono={<ImagePlus className="h-4 w-4" />}
                  disabled={subirImagenMutation.isPending}
                  onClick={() => inputImagenRef.current?.click()}
                >
                  {subirImagenMutation.isPending ? 'Subiendo…' : 'Cambiar foto'}
                </Button>
              </div>
              {subirImagenMutation.isError && (
                <p className="mt-2 text-sm text-red-600">
                  {mensajeError(subirImagenMutation.error, 'No se pudo subir la imagen')}
                </p>
              )}
            </div>

            <form
              onSubmit={editarForm.handleSubmit((values) =>
                editarMutation.mutate({ ...values, marcaId: values.marcaId || null }),
              )}
              className="flex flex-col gap-4"
            >
              {editarMutation.isError && (
                <Alert
                  tipo="error"
                  mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el producto')}
                />
              )}

              <div>
                <label className={labelClass}>Categoría</label>
                <select
                  {...editarForm.register('categoriaId', { required: true })}
                  className={inputClass}
                >
                  {categoriasQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Marca (opcional)</label>
                  <select {...editarForm.register('marcaId')} className={inputClass}>
                    <option value="">Sin marca</option>
                    {marcasQuery.data?.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Unidad de medida</label>
                  <select
                    {...editarForm.register('unidadMedidaId', { required: true })}
                    className={inputClass}
                  >
                    {unidadesMedidaQuery.data?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Nombre</label>
                <input
                  {...editarForm.register('nombre', { required: true })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Descripción</label>
                <input {...editarForm.register('descripcion')} className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Precio (S/.)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...editarForm.register('precio', { required: true, valueAsNumber: true })}
                  className={inputClass}
                />
              </div>

              <label className="flex items-center gap-2.5 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  {...editarForm.register('activo')}
                  className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
                />
                Visible en la carta
              </label>

              <Button
                type="submit"
                disabled={editarForm.formState.isSubmitting || editarMutation.isPending}
                className="mt-2 w-full"
              >
                Guardar cambios
              </Button>
            </form>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        abierto={productoEliminando !== null}
        titulo="Eliminar producto"
        mensaje={`¿Seguro que deseas eliminar "${productoEliminando?.nombre}"? Esta acción no se puede deshacer.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setProductoEliminando(null)}
      />
    </div>
  );
}
