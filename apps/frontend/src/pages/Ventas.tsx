import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Receipt, XCircle } from 'lucide-react';
import * as ventasService from '../services/ventas.service';
import * as pedidosService from '../services/pedidos.service';
import * as clientesService from '../services/clientes.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { formatearFechaHora, formatearPrecio } from '../utils/formato';
import type { CrearVentaInput } from '../services/ventas.service';
import type { EstadoVenta, Venta } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

const CODIGO_FACTURA = '01';

const ETIQUETA_ESTADO: Record<EstadoVenta, string> = {
  emitida: 'Emitida',
  anulada: 'Anulada',
};

const TONO_ESTADO: Record<EstadoVenta, 'exito' | 'neutral' | 'peligro'> = {
  emitida: 'exito',
  anulada: 'peligro',
};

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

export function Ventas() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [ventaAnulando, setVentaAnulando] = useState<Venta | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todas' | EstadoVenta>('todas');

  const ventasQuery = useQuery({
    queryKey: ['ventas'],
    queryFn: () => ventasService.listarVentas(),
  });
  const pedidosQuery = useQuery({ queryKey: ['pedidos'], queryFn: pedidosService.listarPedidos });
  const clientesQuery = useQuery({
    queryKey: ['clientes'],
    queryFn: clientesService.listarClientes,
  });
  const tiposComprobanteQuery = useQuery({
    queryKey: ['tipos-comprobante'],
    queryFn: catalogosService.listarTiposComprobante,
  });
  const mediosPagoQuery = useQuery({
    queryKey: ['medios-pago'],
    queryFn: catalogosService.listarMediosPago,
  });

  const tiposComprobanteFacturables = (tiposComprobanteQuery.data ?? []).filter(
    (t) => t.codigo === '01' || t.codigo === '03',
  );

  const pedidosFacturables = (pedidosQuery.data ?? []).filter(
    (p) =>
      p.estado === 'cerrado' &&
      !(ventasQuery.data ?? []).some((v) => v.pedido.id === p.id && v.estado === 'emitida'),
  );

  const opcionesPedidos: OpcionCombobox[] = pedidosFacturables.map((p) => ({
    valor: p.id,
    etiqueta: `${p.mesa.salon.nombre} — Mesa ${p.mesa.numero}`,
    descripcion: `${formatearPrecio(p.total)} · ${formatearFechaHora(p.creadoEn)}`,
  }));

  const opcionesClientes: OpcionCombobox[] = (clientesQuery.data ?? [])
    .filter((c) => c.activo)
    .map((c) => ({
      valor: c.id,
      etiqueta: `${c.nombres} ${c.apellidos ?? ''}`.trim(),
      descripcion: c.numeroDocumento ?? undefined,
    }));

  const opcionesMediosPago: OpcionCombobox[] = (mediosPagoQuery.data ?? []).map((m) => ({
    valor: m.id,
    etiqueta: m.nombre,
  }));

  const crearForm = useForm<CrearVentaInput>({ defaultValues: { formaPago: 'contado' } });
  const tipoComprobanteId = useWatch({ control: crearForm.control, name: 'tipoComprobanteId' });
  const formaPago = useWatch({ control: crearForm.control, name: 'formaPago' });
  const esFactura =
    tiposComprobanteFacturables.find((t) => t.id === tipoComprobanteId)?.codigo === CODIGO_FACTURA;

  const crearMutation = useMutation({
    mutationFn: ventasService.crearVenta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      setModalAbierto(false);
      crearForm.reset({ formaPago: 'contado' });
    },
  });

  const anularMutation = useMutation({
    mutationFn: () => ventasService.anularVenta(ventaAnulando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      setVentaAnulando(null);
    },
  });

  if (ventasQuery.isLoading) return <Spinner />;

  const ventas = ventasQuery.data ?? [];
  const ventasFiltradas =
    filtroEstado === 'todas' ? ventas : ventas.filter((v) => v.estado === filtroEstado);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Ventas</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Comprobantes emitidos a partir de pedidos cerrados
          </p>
        </div>
        {tienePermiso('ventas.crear') && (
          <Button icono={<Receipt className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nueva venta
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(['todas', 'emitida', 'anulada'] as const).map((valor) => (
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
            encabezado: 'Comprobante',
            render: (v) =>
              `${v.tipoComprobante.nombre} ${v.serie}-${String(v.numero).padStart(6, '0')}`,
          },
          {
            encabezado: 'Mesa',
            render: (v) => `${v.pedido.mesa.salon.nombre} — ${v.pedido.mesa.numero}`,
          },
          {
            encabezado: 'Cliente',
            render: (v) => (v.cliente ? `${v.cliente.nombres} ${v.cliente.apellidos ?? ''}` : '—'),
          },
          { encabezado: 'Fecha', render: (v) => formatearFechaHora(v.creadoEn) },
          { encabezado: 'IGV', render: (v) => formatearPrecio(v.igv) },
          { encabezado: 'Total', render: (v) => formatearPrecio(v.total) },
          {
            encabezado: 'Estado',
            render: (v) => <Badge tono={TONO_ESTADO[v.estado]}>{ETIQUETA_ESTADO[v.estado]}</Badge>,
          },
          {
            encabezado: '',
            render: (v) => (
              <div className="flex items-center gap-3">
                {tienePermiso('ventas.anular') && v.estado === 'emitida' && (
                  <button
                    type="button"
                    onClick={() => setVentaAnulando(v)}
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
        filas={ventasFiltradas}
        claveFila={(v) => v.id}
        vacio="No hay ventas registradas"
      />

      <Modal abierto={modalAbierto} titulo="Nueva venta" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo registrar la venta')}
            />
          )}

          <div>
            <label className={labelClass}>Pedido a facturar</label>
            <Controller
              control={crearForm.control}
              name="pedidoId"
              rules={{ required: true }}
              render={({ field }) => (
                <Combobox
                  opciones={opcionesPedidos}
                  valor={field.value}
                  onCambiar={field.onChange}
                  placeholder="Buscar mesa…"
                  vacio="No hay pedidos cerrados pendientes de facturar"
                />
              )}
            />
          </div>

          <div>
            <label className={labelClass}>Comprobante</label>
            <select
              {...crearForm.register('tipoComprobanteId', { required: true })}
              className={inputClass}
            >
              <option value="">Seleccionar…</option>
              {tiposComprobanteFacturables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>
              Cliente {esFactura && <span className="text-red-500">*</span>}
            </label>
            <Controller
              control={crearForm.control}
              name="clienteId"
              rules={{ required: esFactura }}
              render={({ field }) => (
                <Combobox
                  opciones={opcionesClientes}
                  valor={field.value}
                  onCambiar={field.onChange}
                  placeholder={esFactura ? 'Buscar cliente con RUC…' : 'Buscar cliente… (opcional)'}
                  vacio="No se encontraron clientes"
                />
              )}
            />
            {esFactura && (
              <p className="mt-1 text-xs text-zinc-500">
                Una factura requiere un cliente con RUC registrado.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Forma de pago</label>
              <select {...crearForm.register('formaPago')} className={inputClass}>
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Medio de pago {formaPago === 'contado' && <span className="text-red-500">*</span>}
              </label>
              <Controller
                control={crearForm.control}
                name="medioPagoId"
                rules={{ required: formaPago === 'contado' }}
                render={({ field }) => (
                  <Combobox
                    opciones={opcionesMediosPago}
                    valor={field.value}
                    onCambiar={field.onChange}
                    placeholder="Seleccionar…"
                    vacio="No hay medios de pago"
                  />
                )}
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Registrar venta
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        abierto={ventaAnulando !== null}
        titulo="Anular venta"
        mensaje={`¿Seguro que deseas anular el comprobante ${ventaAnulando?.serie}-${String(ventaAnulando?.numero).padStart(6, '0')}? Esta acción no se puede deshacer.`}
        confirmando={anularMutation.isPending}
        error={
          anularMutation.isError
            ? mensajeError(anularMutation.error, 'No se pudo anular la venta')
            : undefined
        }
        onConfirmar={() => anularMutation.mutate()}
        onCancelar={() => setVentaAnulando(null)}
      />
    </div>
  );
}
