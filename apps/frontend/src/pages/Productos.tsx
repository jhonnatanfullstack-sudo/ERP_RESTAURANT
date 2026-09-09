import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { ImagePlus, Package, Pencil, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react';
import * as productosService from '../services/productos.service';
import * as categoriasService from '../services/categorias.service';
import * as marcasService from '../services/marcas.service';
import * as catalogosService from '../services/catalogos.service';
import * as insumosService from '../services/insumos.service';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { TarjetaOpcion } from '../components/ui/TarjetaOpcion';
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { claseLabel } from '../components/ui/campos';
import { mensajeError } from '../utils/errores';
import { formatearPrecio, urlImagen } from '../utils/formato';
import type {
  ActualizarProductoInput,
  CrearProductoInput,
  LineaRecetaInput,
} from '../services/productos.service';
import type { Insumo, Producto } from '../types/api';

/**
 * Receta de un producto tipo "servicio": qué insumos y cuánto consume una unidad al
 * prepararse. Se maneja con `useState` en vez de `useFieldArray` de react-hook-form —igual
 * criterio que el mini-carrito de "venta directa" en Ventas.tsx— porque son un puñado de
 * líneas simples (insumo + cantidad) sin necesidad de la maquinaria de un field array.
 */
function EditorReceta({
  insumos,
  lineas,
  onAgregar,
  onQuitar,
}: {
  insumos: Insumo[];
  lineas: LineaRecetaInput[];
  onAgregar: (linea: LineaRecetaInput) => void;
  onQuitar: (indice: number) => void;
}) {
  const [insumoStaging, setInsumoStaging] = useState<string | undefined>(undefined);
  const [cantidadStaging, setCantidadStaging] = useState(1);

  const insumoPorId = new Map(insumos.map((i) => [i.id, i]));
  const opciones: OpcionCombobox[] = insumos
    .filter((i) => i.activo && !lineas.some((l) => l.insumoId === i.id))
    .map((i) => ({ valor: i.id, etiqueta: i.nombre, descripcion: i.unidadMedida.nombre }));

  function agregar() {
    if (!insumoStaging) return;
    onAgregar({ insumoId: insumoStaging, cantidad: Math.max(0.001, cantidadStaging || 1) });
    setInsumoStaging(undefined);
    setCantidadStaging(1);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className={claseLabel}>Receta (insumos que consume una unidad)</p>
      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_90px_auto]">
        <Combobox
          id="receta-insumo"
          opciones={opciones}
          valor={insumoStaging}
          onCambiar={setInsumoStaging}
          placeholder="Buscar insumo…"
          vacio="No hay más insumos para agregar"
        />
        <Input
          label=""
          type="number"
          step="0.001"
          min="0.001"
          value={cantidadStaging}
          onChange={(e) => setCantidadStaging(Number(e.target.value))}
        />
        <Button
          type="button"
          icono={<Plus className="h-4 w-4" />}
          onClick={agregar}
          disabled={!insumoStaging}
        >
          Agregar
        </Button>
      </div>

      {lineas.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-400">
          Sin receta todavía: la venta de este producto no descontará ningún insumo.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <ul className="divide-y divide-zinc-100">
            {lineas.map((linea, indice) => {
              const insumo = insumoPorId.get(linea.insumoId);
              return (
                <li key={linea.insumoId} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-zinc-700">
                    {insumo?.nombre ?? 'Insumo'}
                  </span>
                  <span className="shrink-0 text-zinc-500 tabular-nums">
                    {linea.cantidad} {insumo?.unidadMedida.nombre}
                  </span>
                  <button
                    type="button"
                    onClick={() => onQuitar(indice)}
                    aria-label={`Quitar ${insumo?.nombre ?? 'insumo'} de la receta`}
                    className="shrink-0 text-zinc-400 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
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
        <span className="absolute top-2 left-2 flex gap-1.5">
          <Badge tono="neutral">{producto.categoria.nombre}</Badge>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
              producto.tipo === 'servicio'
                ? 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20'
                : 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20'
            }`}
          >
            {producto.tipo === 'servicio' ? (
              <UtensilsCrossed className="h-3 w-3" />
            ) : (
              <Package className="h-3 w-3" />
            )}
            {producto.tipo === 'servicio' ? 'Servicio' : 'Mercadería'}
          </span>
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
  const [recetaCrear, setRecetaCrear] = useState<LineaRecetaInput[]>([]);
  const [recetaEditar, setRecetaEditar] = useState<LineaRecetaInput[]>([]);

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
  const tiposAfectacionIgvQuery = useQuery({
    queryKey: ['tipos-afectacion-igv'],
    queryFn: catalogosService.listarTiposAfectacionIgv,
  });
  const insumosQuery = useQuery({ queryKey: ['insumos'], queryFn: insumosService.listarInsumos });

  const crearForm = useForm<CrearProductoInput>({ defaultValues: { tipo: 'servicio' } });
  const editarForm = useForm<ActualizarProductoInput>();
  const tipoCrear = useWatch({ control: crearForm.control, name: 'tipo' });
  const tipoEditar = useWatch({ control: editarForm.control, name: 'tipo' });

  const crearMutation = useMutation({
    mutationFn: productosService.crearProducto,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos'] });
      setModalAbierto(false);
      crearForm.reset({ tipo: 'servicio' });
      setRecetaCrear([]);
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

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset({ tipo: 'servicio' });
    setRecetaCrear([]);
    crearMutation.reset();
  }

  function cerrarEditar() {
    setProductoEditando(null);
    setRecetaEditar([]);
    editarMutation.reset();
    subirImagenMutation.reset();
  }

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
                  tipoAfectacionIgvId: producto.tipoAfectacionIgv.id,
                  tipo: producto.tipo,
                  nombre: producto.nombre,
                  descripcion: producto.descripcion ?? '',
                  precio: producto.precio,
                  activo: producto.activo,
                });
                setRecetaEditar([]);
                if (producto.tipo === 'servicio') {
                  productosService.obtenerRecetaProducto(producto.id).then((lineas) => {
                    setRecetaEditar(
                      lineas.map((l) => ({ insumoId: l.insumo.id, cantidad: l.cantidad })),
                    );
                  });
                }
              }}
              onEliminar={() => setProductoEliminando(producto)}
            />
          ))}
        </div>
      )}

      <Modal abierto={modalAbierto} titulo="Nuevo producto" onCerrar={cerrarCrear} tamano="lg">
        <form
          onSubmit={crearForm.handleSubmit((values) =>
            crearMutation.mutate({
              ...values,
              marcaId: values.marcaId || null,
              receta: values.tipo === 'servicio' ? recetaCrear : undefined,
            }),
          )}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el producto')}
            />
          )}

          <div className="flex gap-2">
            <TarjetaOpcion
              activo={tipoCrear !== 'mercaderia'}
              icono={UtensilsCrossed}
              titulo="Servicio"
              descripcion="Se prepara (ej. un platillo), descuenta sus insumos al venderse"
              onClick={() => crearForm.setValue('tipo', 'servicio')}
            />
            <TarjetaOpcion
              activo={tipoCrear === 'mercaderia'}
              icono={Package}
              titulo="Mercadería"
              descripcion="Se vende tal cual (ej. una gaseosa), tiene su propio stock"
              onClick={() => crearForm.setValue('tipo', 'mercaderia')}
            />
          </div>

          <Input
            label="Nombre"
            autoFocus
            error={crearForm.formState.errors.nombre?.message}
            {...crearForm.register('nombre', { required: 'El nombre es obligatorio' })}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Categoría"
              error={crearForm.formState.errors.categoriaId?.message}
              {...crearForm.register('categoriaId', { required: 'Selecciona una categoría' })}
            >
              <option value="">Seleccionar…</option>
              {categoriasQuery.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>

            <Select label="Marca" ayuda="Opcional." {...crearForm.register('marcaId')}>
              <option value="">Sin marca</option>
              {marcasQuery.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Unidad de medida"
              error={crearForm.formState.errors.unidadMedidaId?.message}
              {...crearForm.register('unidadMedidaId', {
                required: 'Selecciona la unidad de medida',
              })}
            >
              <option value="">Seleccionar…</option>
              {unidadesMedidaQuery.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>

            <Select
              label="Afectación del IGV"
              ayuda="Determina si al precio se le extrae IGV."
              error={crearForm.formState.errors.tipoAfectacionIgvId?.message}
              {...crearForm.register('tipoAfectacionIgvId', {
                required: 'Selecciona la afectación del IGV',
              })}
            >
              <option value="">Seleccionar…</option>
              {tiposAfectacionIgvQuery.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Precio (S/.)"
              type="number"
              step="0.01"
              min="0"
              ayuda="Precio final al cliente, IGV incluido."
              error={crearForm.formState.errors.precio?.message}
              {...crearForm.register('precio', {
                required: 'El precio es obligatorio',
                valueAsNumber: true,
                min: { value: 0, message: 'El precio no puede ser negativo' },
              })}
            />
            <Input
              label="Descripción"
              ayuda="Opcional. Se muestra en la carta."
              error={crearForm.formState.errors.descripcion?.message}
              {...crearForm.register('descripcion')}
            />
          </div>

          {tipoCrear !== 'mercaderia' && (
            <EditorReceta
              insumos={insumosQuery.data ?? []}
              lineas={recetaCrear}
              onAgregar={(linea) => setRecetaCrear((previo) => [...previo, linea])}
              onQuitar={(indice) =>
                setRecetaCrear((previo) => previo.filter((_, i) => i !== indice))
              }
            />
          )}

          <FormActions
            enviar="Crear producto"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal
        abierto={productoEditando !== null}
        titulo="Editar producto"
        onCerrar={cerrarEditar}
        tamano="lg"
      >
        {productoEditando && (
          <div className="flex flex-col gap-5">
            <div>
              <p className={claseLabel}>Foto del producto</p>
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
                editarMutation.mutate({
                  ...values,
                  marcaId: values.marcaId || null,
                  receta: values.tipo === 'servicio' ? recetaEditar : undefined,
                }),
              )}
              className="flex flex-col gap-4"
              noValidate
            >
              {editarMutation.isError && (
                <Alert
                  tipo="error"
                  mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el producto')}
                />
              )}

              <div className="flex gap-2">
                <TarjetaOpcion
                  activo={tipoEditar !== 'mercaderia'}
                  icono={UtensilsCrossed}
                  titulo="Servicio"
                  descripcion="Se prepara, descuenta sus insumos al venderse"
                  onClick={() => editarForm.setValue('tipo', 'servicio')}
                />
                <TarjetaOpcion
                  activo={tipoEditar === 'mercaderia'}
                  icono={Package}
                  titulo="Mercadería"
                  descripcion="Se vende tal cual, tiene su propio stock"
                  onClick={() => editarForm.setValue('tipo', 'mercaderia')}
                />
              </div>

              <Input
                label="Nombre"
                error={editarForm.formState.errors.nombre?.message}
                {...editarForm.register('nombre', { required: 'El nombre es obligatorio' })}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Categoría"
                  error={editarForm.formState.errors.categoriaId?.message}
                  {...editarForm.register('categoriaId', { required: 'Selecciona una categoría' })}
                >
                  {categoriasQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Select>

                <Select label="Marca" ayuda="Opcional." {...editarForm.register('marcaId')}>
                  <option value="">Sin marca</option>
                  {marcasQuery.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  label="Unidad de medida"
                  error={editarForm.formState.errors.unidadMedidaId?.message}
                  {...editarForm.register('unidadMedidaId', {
                    required: 'Selecciona la unidad de medida',
                  })}
                >
                  {unidadesMedidaQuery.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Afectación del IGV"
                  ayuda="Determina si al precio se le extrae IGV."
                  error={editarForm.formState.errors.tipoAfectacionIgvId?.message}
                  {...editarForm.register('tipoAfectacionIgvId', {
                    required: 'Selecciona la afectación del IGV',
                  })}
                >
                  {tiposAfectacionIgvQuery.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Precio (S/.)"
                  type="number"
                  step="0.01"
                  min="0"
                  ayuda="Precio final al cliente, IGV incluido."
                  error={editarForm.formState.errors.precio?.message}
                  {...editarForm.register('precio', {
                    required: 'El precio es obligatorio',
                    valueAsNumber: true,
                    min: { value: 0, message: 'El precio no puede ser negativo' },
                  })}
                />
                <Input
                  label="Descripción"
                  ayuda="Opcional. Se muestra en la carta."
                  error={editarForm.formState.errors.descripcion?.message}
                  {...editarForm.register('descripcion')}
                />
              </div>

              <Checkbox
                label="Visible en la carta"
                ayuda="Si lo desmarcas, el producto deja de aparecer en la carta pública."
                {...editarForm.register('activo')}
              />

              {tipoEditar !== 'mercaderia' && (
                <EditorReceta
                  insumos={insumosQuery.data ?? []}
                  lineas={recetaEditar}
                  onAgregar={(linea) => setRecetaEditar((previo) => [...previo, linea])}
                  onQuitar={(indice) =>
                    setRecetaEditar((previo) => previo.filter((_, i) => i !== indice))
                  }
                />
              )}

              <FormActions
                enviar="Guardar cambios"
                onCancelar={cerrarEditar}
                enviando={editarForm.formState.isSubmitting || editarMutation.isPending}
              />
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
