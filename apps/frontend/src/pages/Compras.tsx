import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { CheckCircle2, Eye, Pencil, Plus, PlusCircle, ShoppingBag, Trash2, XCircle } from 'lucide-react';
import * as comprasService from '../services/compras.service';
import * as almacenesService from '../services/almacenes.service';
import * as insumosService from '../services/insumos.service';
import * as productosService from '../services/productos.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { BuscadorProveedor } from '../components/BuscadorProveedor';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { FormActions } from '../components/ui/FormActions';
import { EmptyState } from '../components/ui/EmptyState';
import { TarjetaOpcion } from '../components/ui/TarjetaOpcion';
import { claseLabel } from '../components/ui/campos';
import { formatearFechaHora, formatearPrecio, nombreCliente } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import { vacioAIndefinido } from '../utils/formulario';
import type { CrearCompraInput, LineaCompraInput } from '../services/compras.service';
import type { Compra, EstadoCompra, TipoProducto } from '../types/api';

const MAXIMO_LINEAS = 50;

const ETIQUETA_ESTADO: Record<EstadoCompra, string> = {
  registrada: 'Registrada',
  anulada: 'Anulada',
};

const TONO_ESTADO: Record<EstadoCompra, 'exito' | 'neutral' | 'peligro'> = {
  registrada: 'exito',
  anulada: 'peligro',
};

const TIPO_MERCADERIA: TipoProducto = 'mercaderia';

const TASA_IGV_COMPRAS = 0.18;
const CODIGO_AFECTACION_GRAVADO = '10';

/** Clave compuesta para distinguir insumo vs. producto (mercadería) en el mismo combobox de
 * ítems a comprar — evita duplicar el selector en dos campos separados. */
function claveItem(tipo: 'insumo' | 'producto', id: string): string {
  return `${tipo}:${id}`;
}

interface DesgloseLinea {
  sinIgv: number;
  igv: number;
  conIgv: number;
}

/** Espejo de `calcularLineaCompra` en el backend (`compra.service.ts`) — mantenerlos
 * sincronizados si cambia la tasa o la fórmula. Solo para la vista previa del carrito antes de
 * guardar; el cálculo real y autoritativo siempre lo hace el backend al registrar/editar. */
function calcularLineaVista(
  codigoAfectacionIgv: string | undefined,
  montoLinea: number,
  incluyeIgv: boolean,
): DesgloseLinea {
  const esGravado = codigoAfectacionIgv === CODIGO_AFECTACION_GRAVADO;
  if (!esGravado) return { sinIgv: montoLinea, igv: 0, conIgv: montoLinea };
  if (incluyeIgv) {
    const sinIgv = Math.round((montoLinea / (1 + TASA_IGV_COMPRAS)) * 100) / 100;
    return { sinIgv, igv: Math.round((montoLinea - sinIgv) * 100) / 100, conIgv: montoLinea };
  }
  const igv = Math.round(montoLinea * TASA_IGV_COMPRAS * 100) / 100;
  return { sinIgv: montoLinea, igv, conIgv: Math.round((montoLinea + igv) * 100) / 100 };
}

function CompraDetalleModal({ compra, onCerrar }: { compra: Compra | null; onCerrar: () => void }) {
  return (
    <Modal
      abierto={compra !== null}
      titulo={compra ? `Compra a ${nombreCliente(compra.proveedor)}` : ''}
      onCerrar={onCerrar}
    >
      {compra && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-zinc-500">Fecha de emisión</p>
              <p className="font-medium text-zinc-900">{compra.fechaEmision}</p>
            </div>
            <Badge tono={TONO_ESTADO[compra.estado]}>{ETIQUETA_ESTADO[compra.estado]}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div>
              <p className="text-zinc-500">Proveedor</p>
              <p className="font-medium text-zinc-900">{nombreCliente(compra.proveedor)}</p>
              <p className="text-xs text-zinc-500">{compra.proveedor.numeroDocumento}</p>
            </div>
            <div>
              <p className="text-zinc-500">Almacén de destino</p>
              <p className="font-medium text-zinc-900">{compra.almacen.nombre}</p>
            </div>
            <div>
              <p className="text-zinc-500">Comprobante del proveedor</p>
              <p className="font-medium text-zinc-900">
                {compra.tipoComprobante
                  ? `${compra.tipoComprobante.nombre}${compra.serie ? ` ${compra.serie}-${compra.numero ?? ''}` : ''}`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Costo ingresado</p>
              <p className="font-medium text-zinc-900">
                {compra.incluyeIgv ? 'Con IGV incluido' : 'Sin IGV (se sumó aparte)'}
              </p>
            </div>
            {compra.observacion && (
              <div>
                <p className="text-zinc-500">Observación</p>
                <p className="font-medium text-zinc-900">{compra.observacion}</p>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    Ítem
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    Cant.
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    Costo unit.
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    Sin IGV
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    Con IGV
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {compra.detalles.map((detalle) => (
                  <tr key={detalle.id}>
                    <td className="px-3 py-2 text-zinc-900">{detalle.descripcionItem}</td>
                    <td className="px-3 py-2 text-zinc-700">{detalle.cantidad}</td>
                    <td className="px-3 py-2 text-zinc-700">
                      {formatearPrecio(detalle.costoUnitario)}
                    </td>
                    <td className="px-3 py-2 text-zinc-700">
                      {formatearPrecio(detalle.valorCompra)}
                    </td>
                    <td className="px-3 py-2 font-medium text-zinc-900">
                      {formatearPrecio(detalle.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto flex w-full max-w-56 flex-col gap-1.5 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>Valor de compra (sin IGV)</span>
              <span>{formatearPrecio(compra.subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>IGV</span>
              <span>{formatearPrecio(compra.igv)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-bold text-zinc-900">
              <span>Total</span>
              <span>{formatearPrecio(compra.total)}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Compras() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [compraEditando, setCompraEditando] = useState<Compra | null>(null);
  const [compraViendo, setCompraViendo] = useState<Compra | null>(null);
  const [compraAnulando, setCompraAnulando] = useState<Compra | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todas' | EstadoCompra>('todas');
  const [itemStaging, setItemStaging] = useState<string | undefined>(undefined);
  const [cantidadStaging, setCantidadStaging] = useState(1);
  const [costoStaging, setCostoStaging] = useState(0);
  const [errorCarrito, setErrorCarrito] = useState<string | null>(null);

  const comprasQuery = useQuery({ queryKey: ['compras'], queryFn: comprasService.listarCompras });
  const almacenesQuery = useQuery({
    queryKey: ['almacenes'],
    queryFn: almacenesService.listarAlmacenes,
  });
  const insumosQuery = useQuery({ queryKey: ['insumos'], queryFn: insumosService.listarInsumos });
  const productosQuery = useQuery({
    queryKey: ['productos'],
    queryFn: productosService.listarProductos,
  });
  const tiposComprobanteQuery = useQuery({
    queryKey: ['tipos-comprobante'],
    queryFn: catalogosService.listarTiposComprobante,
  });

  const almacenesActivos = (almacenesQuery.data ?? []).filter((a) => a.activo);
  const insumosActivos = (insumosQuery.data ?? []).filter((i) => i.activo);
  const productosMercaderia = (productosQuery.data ?? []).filter(
    (p) => p.activo && p.tipo === TIPO_MERCADERIA,
  );

  const opcionesAlmacenes: OpcionCombobox[] = almacenesActivos.map((a) => ({
    valor: a.id,
    etiqueta: a.nombre,
  }));
  const opcionesItems: OpcionCombobox[] = [
    ...insumosActivos.map((i) => ({
      valor: claveItem('insumo', i.id),
      etiqueta: i.nombre,
      descripcion: `Insumo · ${i.unidadMedida.nombre}${i.ultimoCosto != null ? ` · último costo ${formatearPrecio(i.ultimoCosto)}` : ''}`,
    })),
    ...productosMercaderia.map((p) => ({
      valor: claveItem('producto', p.id),
      etiqueta: p.nombre,
      descripcion: `Mercadería · ${formatearPrecio(p.precio)} (precio de venta)`,
    })),
  ];

  // Busca en la lista completa (no solo activos): al editar una compra antigua, alguna línea
  // puede referenciar un insumo/producto ya desactivado — debe seguir mostrando su nombre real
  // en el carrito en vez de caer al genérico "Ítem". El combo para AGREGAR líneas nuevas sigue
  // restringido a activos (`opcionesItems`), esto es solo para mostrar el nombre correctamente.
  function itemDe(linea: LineaCompraInput) {
    if (linea.insumoId) {
      const insumo = (insumosQuery.data ?? []).find((i) => i.id === linea.insumoId);
      return insumo
        ? {
            nombre: insumo.nombre,
            unidad: insumo.unidadMedida.nombre,
            codigoAfectacionIgv: insumo.tipoAfectacionIgv.codigo,
          }
        : null;
    }
    if (linea.productoId) {
      const producto = (productosQuery.data ?? []).find((p) => p.id === linea.productoId);
      return producto
        ? { nombre: producto.nombre, unidad: null, codigoAfectacionIgv: producto.tipoAfectacionIgv.codigo }
        : null;
    }
    return null;
  }

  const crearForm = useForm<CrearCompraInput>({
    defaultValues: { lineas: [], incluyeIgv: true },
  });
  const carrito = useFieldArray({ control: crearForm.control, name: 'lineas' });
  const lineasCarrito = useWatch({ control: crearForm.control, name: 'lineas' }) ?? [];
  const incluyeIgv = useWatch({ control: crearForm.control, name: 'incluyeIgv' }) ?? true;

  const desglosesCarrito = lineasCarrito.map((linea) =>
    calcularLineaVista(itemDe(linea)?.codigoAfectacionIgv, linea.costoUnitario * linea.cantidad, incluyeIgv),
  );
  const totalSinIgv = desglosesCarrito.reduce((suma, d) => suma + d.sinIgv, 0);
  const totalIgv = desglosesCarrito.reduce((suma, d) => suma + d.igv, 0);
  const totalConIgv = desglosesCarrito.reduce((suma, d) => suma + d.conIgv, 0);

  const crearMutation = useMutation({
    mutationFn: comprasService.crearCompra,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['existencias'] });
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      cerrarFormulario();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: CrearCompraInput) =>
      comprasService.actualizarCompra(compraEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['existencias'] });
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      cerrarFormulario();
    },
  });

  const anularMutation = useMutation({
    mutationFn: () => comprasService.anularCompra(compraAnulando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['existencias'] });
      setCompraAnulando(null);
    },
  });

  function cerrarFormulario() {
    setModalAbierto(false);
    setCompraEditando(null);
    crearForm.reset({ lineas: [], incluyeIgv: true });
    crearMutation.reset();
    editarMutation.reset();
    setItemStaging(undefined);
    setCantidadStaging(1);
    setCostoStaging(0);
    setErrorCarrito(null);
  }

  function abrirEditar(compra: Compra) {
    setCompraEditando(compra);
    crearForm.reset({
      proveedorId: compra.proveedor.id,
      almacenId: compra.almacen.id,
      tipoComprobanteId: compra.tipoComprobante?.id ?? '',
      serie: compra.serie ?? '',
      numero: compra.numero ?? '',
      fechaEmision: compra.fechaEmision,
      incluyeIgv: compra.incluyeIgv,
      observacion: compra.observacion ?? '',
      lineas: compra.detalles.map((detalle) => ({
        insumoId: detalle.insumo?.id,
        productoId: detalle.producto?.id,
        cantidad: detalle.cantidad,
        costoUnitario: detalle.costoUnitario,
      })),
    });
  }

  function agregarLinea() {
    if (!itemStaging || costoStaging <= 0) return;
    const [tipo, id] = itemStaging.split(':');
    const cantidad = Math.max(1, Math.round(cantidadStaging) || 1);
    const nueva: LineaCompraInput =
      tipo === 'insumo'
        ? { insumoId: id, cantidad, costoUnitario: costoStaging }
        : { productoId: id, cantidad, costoUnitario: costoStaging };

    const indiceExistente = carrito.fields.findIndex(
      (f) => f.insumoId === nueva.insumoId && f.productoId === nueva.productoId,
    );
    if (indiceExistente >= 0) {
      const previa = carrito.fields[indiceExistente];
      carrito.update(indiceExistente, { ...previa, cantidad: previa.cantidad + cantidad });
    } else {
      if (carrito.fields.length >= MAXIMO_LINEAS) return;
      carrito.append(nueva);
    }
    setItemStaging(undefined);
    setCantidadStaging(1);
    setCostoStaging(0);
    setErrorCarrito(null);
  }

  function alSeleccionarItem(valor: string) {
    setItemStaging(valor);
    const [tipo, id] = valor.split(':');
    if (tipo === 'insumo') {
      const insumo = insumosActivos.find((i) => i.id === id);
      setCostoStaging(insumo?.ultimoCosto ?? 0);
    } else {
      setCostoStaging(0);
    }
  }

  function alEnviar(values: CrearCompraInput) {
    if (!values.lineas || values.lineas.length === 0) {
      setErrorCarrito('Agrega al menos un ítem antes de registrar la compra');
      return;
    }
    const payload: CrearCompraInput = {
      ...values,
      tipoComprobanteId: vacioAIndefinido(values.tipoComprobanteId),
      serie: vacioAIndefinido(values.serie),
      numero: vacioAIndefinido(values.numero),
      fechaEmision: vacioAIndefinido(values.fechaEmision),
      observacion: vacioAIndefinido(values.observacion),
    };
    if (compraEditando) {
      editarMutation.mutate(payload);
    } else {
      crearMutation.mutate(payload);
    }
  }

  const compras = comprasQuery.data ?? [];
  const comprasFiltradas =
    filtroEstado === 'todas' ? compras : compras.filter((c) => c.estado === filtroEstado);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Compras</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Registro de compras a proveedores — genera ingresos de stock en el kardex
          </p>
        </div>
        {tienePermiso('compras.crear') && (
          <Button
            icono={<ShoppingBag className="h-4 w-4" />}
            onClick={() => {
              crearForm.reset({ lineas: [], incluyeIgv: true });
              setModalAbierto(true);
            }}
          >
            Nueva compra
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(['todas', 'registrada', 'anulada'] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            onClick={() => setFiltroEstado(valor)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filtroEstado === valor
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {valor === 'todas' ? 'Todas' : ETIQUETA_ESTADO[valor]}
          </button>
        ))}
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Proveedor',
            render: (c) => (
              <button
                type="button"
                onClick={() => setCompraViendo(c)}
                className="font-medium text-orange-600 hover:text-orange-700 hover:underline"
              >
                {nombreCliente(c.proveedor)}
              </button>
            ),
          },
          { encabezado: 'Fecha emisión', render: (c) => c.fechaEmision },
          { encabezado: 'Almacén', render: (c) => c.almacen.nombre },
          { encabezado: 'Registrada', render: (c) => formatearFechaHora(c.creadoEn) },
          { encabezado: 'Total', render: (c) => formatearPrecio(c.total) },
          {
            encabezado: 'Estado',
            render: (c) => <Badge tono={TONO_ESTADO[c.estado]}>{ETIQUETA_ESTADO[c.estado]}</Badge>,
          },
          {
            encabezado: '',
            render: (c) => (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCompraViendo(c)}
                  className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver
                </button>
                {tienePermiso('compras.editar') && c.estado === 'registrada' && (
                  <button
                    type="button"
                    onClick={() => abrirEditar(c)}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('compras.anular') && c.estado === 'registrada' && (
                  <button
                    type="button"
                    onClick={() => setCompraAnulando(c)}
                    className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Anular
                  </button>
                )}
              </div>
            ),
          },
        ]}
        filas={comprasFiltradas}
        claveFila={(c) => c.id}
        vacio="No hay compras registradas"
        cargando={comprasQuery.isLoading}
        error={
          comprasQuery.isError
            ? mensajeError(comprasQuery.error, 'No se pudieron cargar las compras')
            : undefined
        }
        onReintentar={() => void comprasQuery.refetch()}
      />

      <Modal
        abierto={modalAbierto || compraEditando !== null}
        titulo={compraEditando ? 'Editar compra' : 'Nueva compra'}
        descripcion={
          compraEditando
            ? 'Corrige los datos o los ítems de esta compra — el kardex se ajusta automáticamente para que el stock quede exacto.'
            : 'Registra lo comprado a un proveedor — cada ítem ingresa al kardex del almacén elegido.'
        }
        onCerrar={cerrarFormulario}
        tamano="xl"
      >
        <form
          onSubmit={crearForm.handleSubmit(alEnviar)}
          className="flex flex-col gap-4"
          noValidate
        >
          {compraEditando && (
            <Alert
              tipo="advertencia"
              mensaje="Al guardar, se revierte el ingreso de stock anterior de esta compra y se registra uno nuevo con los datos actuales — el saldo del almacén queda igual que si la hubieras registrado así desde el inicio."
            />
          )}

          {(crearMutation.isError || editarMutation.isError) && (
            <Alert
              tipo="error"
              mensaje={mensajeError(
                compraEditando ? editarMutation.error : crearMutation.error,
                compraEditando ? 'No se pudo actualizar la compra' : 'No se pudo registrar la compra',
              )}
            />
          )}

          <Controller
            control={crearForm.control}
            name="proveedorId"
            rules={{ required: 'Selecciona o registra el proveedor' }}
            render={({ field, fieldState }) => (
              <BuscadorProveedor
                proveedorId={field.value}
                onCambiar={field.onChange}
                requerido
                error={fieldState.error?.message}
              />
            )}
          />

          <div className="flex flex-col gap-4 border-t border-zinc-200 pt-4">
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              Detalles de la compra
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                control={crearForm.control}
                name="almacenId"
                rules={{ required: 'Selecciona el almacén de destino' }}
                render={({ field, fieldState }) => (
                  <FormField
                    id="compra-almacen"
                    label="Almacén de destino"
                    error={fieldState.error?.message}
                  >
                    <Combobox
                      id="compra-almacen"
                      opciones={opcionesAlmacenes}
                      valor={field.value}
                      onCambiar={field.onChange}
                      placeholder="Buscar almacén…"
                      vacio="No hay almacenes activos"
                    />
                  </FormField>
                )}
              />
              <Input
                label="Fecha de emisión"
                type="date"
                ayuda="Si se deja vacío, se usa la fecha de hoy."
                {...crearForm.register('fechaEmision')}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select label="Comprobante del proveedor" {...crearForm.register('tipoComprobanteId')}>
                <option value="">Sin comprobante</option>
                {tiposComprobanteQuery.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </Select>
              <Input label="Serie" placeholder="Ej. F001" {...crearForm.register('serie')} />
              <Input label="Número" placeholder="Ej. 000123" {...crearForm.register('numero')} />
            </div>
            <Input label="Observación" ayuda="Opcional." {...crearForm.register('observacion')} />

            <Controller
              control={crearForm.control}
              name="incluyeIgv"
              render={({ field }) => (
                <div>
                  <p className={claseLabel}>¿El costo de cada ítem incluye IGV?</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <TarjetaOpcion
                      activo={field.value}
                      icono={CheckCircle2}
                      titulo="Sí, incluido"
                      descripcion="El costo unitario ya trae el IGV — se desglosa hacia atrás (lo usual)."
                      onClick={() => field.onChange(true)}
                    />
                    <TarjetaOpcion
                      activo={!field.value}
                      icono={PlusCircle}
                      titulo="No, se suma aparte"
                      descripcion="El costo unitario es el valor de compra puro — el IGV se agrega al total."
                      onClick={() => field.onChange(false)}
                    />
                  </div>
                </div>
              )}
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4">
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              Ítems comprados
            </p>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_90px_110px_auto]">
              <FormField id="compra-item" label="Insumo o mercadería">
                <Combobox
                  id="compra-item"
                  opciones={opcionesItems}
                  valor={itemStaging}
                  onCambiar={alSeleccionarItem}
                  placeholder="Buscar…"
                  vacio="No hay insumos ni mercadería activos"
                />
              </FormField>
              <Input
                label="Cantidad"
                type="number"
                min="1"
                value={cantidadStaging}
                onChange={(evento) => setCantidadStaging(Number(evento.target.value))}
              />
              <Input
                label="Costo unit."
                type="number"
                min="0"
                step="0.01"
                value={costoStaging}
                onChange={(evento) => setCostoStaging(Number(evento.target.value))}
              />
              <Button
                type="button"
                icono={<Plus className="h-4 w-4" />}
                onClick={agregarLinea}
                disabled={!itemStaging || costoStaging <= 0}
              >
                Agregar
              </Button>
            </div>

            {carrito.fields.length === 0 ? (
              <EmptyState icono={ShoppingBag} titulo="Aún no agregaste ítems" />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                      <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                        Ítem
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                        Cant.
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                        Costo unit.
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                        Sin IGV
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                        Con IGV
                      </th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {carrito.fields.map((linea, indice) => {
                      const item = itemDe(linea);
                      const desglose = calcularLineaVista(
                        item?.codigoAfectacionIgv,
                        linea.costoUnitario * linea.cantidad,
                        incluyeIgv,
                      );
                      return (
                        <tr key={linea.id}>
                          <td className="px-3 py-2 text-sm font-medium text-zinc-900">
                            {item?.nombre ?? 'Ítem'}
                            {item?.unidad && (
                              <span className="ml-1 text-xs text-zinc-400">({item.unidad})</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="1"
                              value={linea.cantidad}
                              onChange={(evento) =>
                                carrito.update(indice, {
                                  ...linea,
                                  cantidad: Math.max(1, Math.round(Number(evento.target.value)) || 1),
                                })
                              }
                              aria-label={`Cantidad de ${item?.nombre ?? 'ítem'}`}
                              className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-center text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={linea.costoUnitario}
                              onChange={(evento) =>
                                carrito.update(indice, {
                                  ...linea,
                                  costoUnitario: Math.max(0, Number(evento.target.value) || 0),
                                })
                              }
                              aria-label={`Costo unitario de ${item?.nombre ?? 'ítem'}`}
                              className="w-24 rounded-lg border border-zinc-300 px-2 py-1.5 text-right text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            />
                          </td>
                          <td className="px-3 py-2 text-zinc-700">
                            {formatearPrecio(desglose.sinIgv)}
                          </td>
                          <td className="px-3 py-2 font-semibold text-zinc-900">
                            {formatearPrecio(desglose.conIgv)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => carrito.remove(indice)}
                              aria-label={`Quitar ${item?.nombre ?? 'ítem'}`}
                              className="text-zinc-400 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-200 bg-zinc-50 text-sm">
                      <td colSpan={3} />
                      <td className="px-3 py-2 font-medium text-zinc-600">
                        {formatearPrecio(totalSinIgv)}
                      </td>
                      <td className="px-3 py-2 font-bold text-zinc-900">
                        {formatearPrecio(totalConIgv)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                <div className="flex justify-end gap-4 border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                  <span>IGV&nbsp;{formatearPrecio(totalIgv)}</span>
                </div>
              </div>
            )}

            {errorCarrito && <p className="text-xs font-medium text-red-600">{errorCarrito}</p>}
          </div>

          <FormActions
            enviar={compraEditando ? 'Guardar cambios' : 'Registrar compra'}
            enviandoTexto={compraEditando ? 'Guardando…' : 'Registrando…'}
            onCancelar={cerrarFormulario}
            enviando={
              crearForm.formState.isSubmitting ||
              crearMutation.isPending ||
              editarMutation.isPending
            }
          />
        </form>
      </Modal>

      <CompraDetalleModal compra={compraViendo} onCerrar={() => setCompraViendo(null)} />

      <ConfirmDialog
        abierto={compraAnulando !== null}
        titulo="Anular compra"
        mensaje="¿Seguro que deseas anular esta compra? Se generará un movimiento de reversa en el kardex para descontar el stock que había ingresado. Esta acción no se puede deshacer."
        confirmando={anularMutation.isPending}
        error={
          anularMutation.isError
            ? mensajeError(anularMutation.error, 'No se pudo anular la compra')
            : undefined
        }
        onConfirmar={() => anularMutation.mutate()}
        onCancelar={() => setCompraAnulando(null)}
      />
    </div>
  );
}
