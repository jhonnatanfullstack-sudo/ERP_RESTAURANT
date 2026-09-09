import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Beef,
  Package,
  Plus,
  Warehouse,
} from 'lucide-react';
import * as inventarioService from '../services/inventario.service';
import * as insumosService from '../services/insumos.service';
import * as productosService from '../services/productos.service';
import * as almacenesService from '../services/almacenes.service';
import { useAuth } from '../context/AuthContext';
import { StatCard } from '../components/ui/StatCard';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { FormField } from '../components/ui/FormField';
import { FormActions } from '../components/ui/FormActions';
import { TarjetaOpcion } from '../components/ui/TarjetaOpcion';
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { formatearFechaHora, nombrePersonal } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type { RegistrarMovimientoInventarioInput } from '../services/inventario.service';
import type { TipoMovimientoExistencia } from '../types/api';

const ETIQUETA_TIPO_MOVIMIENTO: Record<TipoMovimientoExistencia, string> = {
  inicial: 'Stock inicial',
  compra: 'Compra',
  ajuste_entrada: 'Ajuste (entrada)',
  ajuste_salida: 'Ajuste (salida)',
  consumo_cocina: 'Consumo en cocina',
  venta_directa: 'Venta',
};

const TIPOS_ENTRADA: TipoMovimientoExistencia[] = ['inicial', 'compra', 'ajuste_entrada'];

/** Origen de la línea al registrar un movimiento manual: qué se está moviendo, un insumo
 * (materia prima) o un producto tipo mercadería (se vende tal cual, ej. una gaseosa). */
type OrigenItem = 'insumo' | 'producto';

function esEntrada(tipo: TipoMovimientoExistencia): boolean {
  return TIPOS_ENTRADA.includes(tipo);
}

function RegistrarMovimientoModal({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [origen, setOrigen] = useState<OrigenItem>('insumo');

  const almacenesQuery = useQuery({
    queryKey: ['almacenes'],
    queryFn: almacenesService.listarAlmacenes,
  });
  const insumosQuery = useQuery({ queryKey: ['insumos'], queryFn: insumosService.listarInsumos });
  const productosQuery = useQuery({
    queryKey: ['productos'],
    queryFn: productosService.listarProductos,
  });
  const productosMercaderia = (productosQuery.data ?? []).filter((p) => p.tipo === 'mercaderia');

  const form = useForm<RegistrarMovimientoInventarioInput>({
    defaultValues: { tipo: 'compra' },
  });
  const tipo = useWatch({ control: form.control, name: 'tipo' });

  const mutation = useMutation({
    mutationFn: inventarioService.registrarMovimiento,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventario-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-movimientos'] });
      cerrar();
    },
  });

  function cerrar() {
    form.reset({ tipo: 'compra' });
    setOrigen('insumo');
    mutation.reset();
    onCerrar();
  }

  function alEnviar(values: RegistrarMovimientoInventarioInput) {
    mutation.mutate({
      ...values,
      insumoId: origen === 'insumo' ? values.insumoId : undefined,
      productoId: origen === 'producto' ? values.productoId : undefined,
    });
  }

  const opcionesInsumos: OpcionCombobox[] = (insumosQuery.data ?? [])
    .filter((i) => i.activo)
    .map((i) => ({ valor: i.id, etiqueta: i.nombre, descripcion: i.unidadMedida.nombre }));
  const opcionesProductos: OpcionCombobox[] = productosMercaderia.map((p) => ({
    valor: p.id,
    etiqueta: p.nombre,
  }));

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar movimiento"
      descripcion="Una compra o un ajuste manual de stock — el consumo de cocina y las ventas se registran solos."
      onCerrar={cerrar}
    >
      <form onSubmit={form.handleSubmit(alEnviar)} className="flex flex-col gap-4" noValidate>
        {mutation.isError && (
          <Alert
            tipo="error"
            mensaje={mensajeError(mutation.error, 'No se pudo registrar el movimiento')}
          />
        )}

        <div className="flex gap-2">
          <TarjetaOpcion
            activo={origen === 'insumo'}
            icono={Beef}
            titulo="Insumo"
            descripcion="Materia prima de una receta"
            onClick={() => setOrigen('insumo')}
          />
          <TarjetaOpcion
            activo={origen === 'producto'}
            icono={Package}
            titulo="Mercadería"
            descripcion="Se vende tal cual, ej. una bebida"
            onClick={() => setOrigen('producto')}
          />
        </div>

        {origen === 'insumo' ? (
          <Controller
            control={form.control}
            name="insumoId"
            rules={{ required: origen === 'insumo' ? 'Selecciona el insumo' : false }}
            render={({ field, fieldState }) => (
              <FormField id="mov-insumo" label="Insumo" error={fieldState.error?.message}>
                <Combobox
                  id="mov-insumo"
                  opciones={opcionesInsumos}
                  valor={field.value}
                  onCambiar={field.onChange}
                  placeholder="Buscar insumo…"
                  vacio="No hay insumos activos"
                />
              </FormField>
            )}
          />
        ) : (
          <Controller
            control={form.control}
            name="productoId"
            rules={{ required: origen === 'producto' ? 'Selecciona el producto' : false }}
            render={({ field, fieldState }) => (
              <FormField
                id="mov-producto"
                label="Producto (mercadería)"
                error={fieldState.error?.message}
              >
                <Combobox
                  id="mov-producto"
                  opciones={opcionesProductos}
                  valor={field.value}
                  onCambiar={field.onChange}
                  placeholder="Buscar producto…"
                  vacio="No hay productos tipo mercadería"
                />
              </FormField>
            )}
          />
        )}

        <Select
          label="Almacén"
          error={form.formState.errors.almacenId?.message}
          {...form.register('almacenId', { required: 'Selecciona el almacén' })}
        >
          <option value="">Seleccionar…</option>
          {almacenesQuery.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
              {a.esPrincipal ? ' (principal)' : ''}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Tipo de movimiento" {...form.register('tipo')}>
            <option value="compra">Compra</option>
            <option value="inicial">Stock inicial</option>
            <option value="ajuste_entrada">Ajuste (entrada)</option>
            <option value="ajuste_salida">Ajuste (salida)</option>
          </Select>

          <Input
            label="Cantidad"
            type="number"
            step="0.001"
            min="0.001"
            error={form.formState.errors.cantidad?.message}
            {...form.register('cantidad', {
              required: 'Indica la cantidad',
              valueAsNumber: true,
              min: { value: 0.001, message: 'Debe ser mayor a 0' },
            })}
          />
        </div>

        {esEntrada(tipo) && (
          <Input
            label="Costo unitario (opcional)"
            type="number"
            step="0.01"
            min="0"
            ayuda="Lo que costó cada unidad — sirve para valorizar el inventario."
            {...form.register('costoUnitario', { valueAsNumber: true })}
          />
        )}

        <Input
          label="Observación (opcional)"
          placeholder="Ej. compra a proveedor, merma por vencimiento…"
          {...form.register('observacion')}
        />

        <FormActions
          enviar="Registrar"
          enviandoTexto="Registrando…"
          onCancelar={cerrar}
          enviando={form.formState.isSubmitting || mutation.isPending}
        />
      </form>
    </Modal>
  );
}

export function Inventario() {
  const { tienePermiso } = useAuth();
  const [modalAbierto, setModalAbierto] = useState(false);

  const stockQuery = useQuery({
    queryKey: ['inventario-stock'],
    queryFn: inventarioService.listarStock,
  });
  const movimientosQuery = useQuery({
    queryKey: ['inventario-movimientos'],
    queryFn: () => inventarioService.listarMovimientos(),
  });
  const insumosQuery = useQuery({ queryKey: ['insumos'], queryFn: insumosService.listarInsumos });
  const productosQuery = useQuery({
    queryKey: ['productos'],
    queryFn: productosService.listarProductos,
  });
  const almacenesQuery = useQuery({
    queryKey: ['almacenes'],
    queryFn: almacenesService.listarAlmacenes,
  });

  const insumoPorId = useMemo(
    () => new Map((insumosQuery.data ?? []).map((i) => [i.id, i])),
    [insumosQuery.data],
  );
  const productoPorId = useMemo(
    () => new Map((productosQuery.data ?? []).map((p) => [p.id, p])),
    [productosQuery.data],
  );
  const almacenPorId = useMemo(
    () => new Map((almacenesQuery.data ?? []).map((a) => [a.id, a])),
    [almacenesQuery.data],
  );

  const filasStock = (stockQuery.data ?? [])
    .map((fila) => {
      const item = fila.insumoId
        ? insumoPorId.get(fila.insumoId)
        : productoPorId.get(fila.productoId!);
      const almacen = almacenPorId.get(fila.almacenId);
      if (!item || !almacen) return null;
      return {
        clave: `${fila.almacenId}-${fila.insumoId ?? fila.productoId}`,
        nombre: item.nombre,
        tipo: fila.insumoId ? ('Insumo' as const) : ('Mercadería' as const),
        unidad: 'unidadMedida' in item ? item.unidadMedida.nombre : '—',
        almacen: almacen.nombre,
        stock: fila.stock,
      };
    })
    .filter((fila): fila is NonNullable<typeof fila> => fila !== null)
    .sort((a, b) => a.stock - b.stock);

  const itemsConStockBajo = filasStock.filter((f) => f.stock <= 0).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Inventario</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Stock de insumos y mercadería, y el historial de movimientos (kardex)
          </p>
        </div>
        {tienePermiso('inventario.ajustar') && (
          <Button icono={<Plus className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Registrar movimiento
          </Button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          etiqueta="Insumos activos"
          valor={(insumosQuery.data ?? []).filter((i) => i.activo).length}
          icono={Beef}
          tono="naranja"
        />
        <StatCard
          etiqueta="Mercadería con stock"
          valor={(productosQuery.data ?? []).filter((p) => p.tipo === 'mercaderia').length}
          icono={Package}
          tono="azul"
        />
        <StatCard
          etiqueta="Almacenes"
          valor={(almacenesQuery.data ?? []).length}
          icono={Warehouse}
          tono="violeta"
        />
        <StatCard
          etiqueta="Sin stock"
          valor={itemsConStockBajo}
          icono={AlertTriangle}
          tono="ambar"
          descripcion="Ítems en 0 o negativo"
        />
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Stock actual por almacén</h2>
        <Table
          columnas={[
            { encabezado: 'Ítem', render: (f) => f.nombre },
            { encabezado: 'Tipo', render: (f) => f.tipo },
            { encabezado: 'Almacén', render: (f) => f.almacen },
            {
              encabezado: 'Stock',
              render: (f) => (
                <span
                  className={`font-semibold tabular-nums ${f.stock <= 0 ? 'text-red-600' : 'text-zinc-900'}`}
                >
                  {f.stock.toLocaleString('es-PE', { maximumFractionDigits: 3 })} {f.unidad}
                </span>
              ),
            },
          ]}
          filas={filasStock}
          claveFila={(f) => f.clave}
          vacio="Aún no hay movimientos de stock registrados"
          vacioDescripcion="Registra una compra o el stock inicial de un insumo/mercadería para empezar."
          cargando={stockQuery.isLoading || insumosQuery.isLoading || productosQuery.isLoading}
          error={
            stockQuery.isError
              ? mensajeError(stockQuery.error, 'No se pudo cargar el stock')
              : undefined
          }
          onReintentar={() => void stockQuery.refetch()}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Movimientos recientes</h2>
        <Table
          columnas={[
            {
              encabezado: 'Tipo',
              render: (m) => (
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    esEntrada(m.tipo) ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {esEntrada(m.tipo) ? (
                    <ArrowDownCircle className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpCircle className="h-3.5 w-3.5" />
                  )}
                  {ETIQUETA_TIPO_MOVIMIENTO[m.tipo]}
                </span>
              ),
            },
            { encabezado: 'Ítem', render: (m) => m.insumo?.nombre ?? m.producto?.nombre ?? '—' },
            { encabezado: 'Almacén', render: (m) => m.almacen.nombre },
            {
              encabezado: 'Cantidad',
              render: (m) => (
                <span className={esEntrada(m.tipo) ? 'text-emerald-700' : 'text-red-700'}>
                  {esEntrada(m.tipo) ? '+' : '−'}
                  {m.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 3 })}
                </span>
              ),
            },
            {
              encabezado: 'Origen',
              render: (m) =>
                m.usuario ? (
                  nombrePersonal(m.usuario.personal)
                ) : (
                  <Badge tono="neutral">Automático</Badge>
                ),
            },
            { encabezado: 'Fecha', render: (m) => formatearFechaHora(m.creadoEn) },
          ]}
          filas={(movimientosQuery.data ?? []).slice(0, 30)}
          claveFila={(m) => m.id}
          vacio="Aún no hay movimientos registrados"
          cargando={movimientosQuery.isLoading}
          error={
            movimientosQuery.isError
              ? mensajeError(movimientosQuery.error, 'No se pudo cargar el historial')
              : undefined
          }
          onReintentar={() => void movimientosQuery.refetch()}
        />
      </div>

      <RegistrarMovimientoModal abierto={modalAbierto} onCerrar={() => setModalAbierto(false)} />
    </div>
  );
}
