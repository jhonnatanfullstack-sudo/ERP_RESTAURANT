import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Eye, Receipt, XCircle } from 'lucide-react';
import * as ventasService from '../services/ventas.service';
import * as pedidosService from '../services/pedidos.service';
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
import { BuscadorCliente } from '../components/BuscadorCliente';
import { formatearFechaHora, formatearPrecio, nombreCliente } from '../utils/formato';
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

function numeroComprobante(venta: Pick<Venta, 'serie' | 'numero'>): string {
  return `${venta.serie}-${String(venta.numero).padStart(6, '0')}`;
}

function VentaDetalleModal({ venta, onCerrar }: { venta: Venta | null; onCerrar: () => void }) {
  return (
    <Modal
      abierto={venta !== null}
      titulo={venta ? `${venta.tipoComprobante.nombre} ${numeroComprobante(venta)}` : ''}
      onCerrar={onCerrar}
    >
      {venta && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-zinc-500">Fecha de emisión</p>
              <p className="font-medium text-zinc-900">{formatearFechaHora(venta.creadoEn)}</p>
            </div>
            <Badge tono={TONO_ESTADO[venta.estado]}>{ETIQUETA_ESTADO[venta.estado]}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div>
              <p className="text-zinc-500">Mesa</p>
              <p className="font-medium text-zinc-900">
                {venta.pedido.mesa.salon.nombre} — {venta.pedido.mesa.numero}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Cliente</p>
              <p className="font-medium text-zinc-900">{nombreCliente(venta.cliente)}</p>
              {venta.cliente?.numeroDocumento && (
                <p className="text-xs text-zinc-500">
                  {venta.cliente.tipoDocumentoIdentidad?.nombre}: {venta.cliente.numeroDocumento}
                </p>
              )}
            </div>
            <div>
              <p className="text-zinc-500">Tipo de operación</p>
              <p className="font-medium text-zinc-900">{venta.tipoOperacion.nombre}</p>
            </div>
            <div>
              <p className="text-zinc-500">Forma / medio de pago</p>
              <p className="font-medium text-zinc-900">
                {venta.formaPago === 'contado' ? 'Contado' : 'Crédito'}
                {venta.medioPago && ` · ${venta.medioPago.nombre}`}
              </p>
            </div>
            {venta.tipoCambio && (
              <div>
                <p className="text-zinc-500">Tipo de cambio (venta, SUNAT)</p>
                <p className="font-medium text-zinc-900">{venta.tipoCambio.toFixed(3)}</p>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    Producto
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    Cant.
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    P. unit.
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                    Subtotal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {venta.detalles.map((detalle) => (
                  <tr key={detalle.id}>
                    <td className="px-3 py-2 text-zinc-900">{detalle.descripcionProducto}</td>
                    <td className="px-3 py-2 text-zinc-700">{detalle.cantidad}</td>
                    <td className="px-3 py-2 text-zinc-700">
                      {formatearPrecio(detalle.precioUnitario)}
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
              <span>Subtotal (sin IGV)</span>
              <span>{formatearPrecio(venta.subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>IGV (18%)</span>
              <span>{formatearPrecio(venta.igv)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-bold text-zinc-900">
              <span>Total</span>
              <span>{formatearPrecio(venta.total)}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Ventas() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [ventaViendo, setVentaViendo] = useState<Venta | null>(null);
  const [ventaAnulando, setVentaAnulando] = useState<Venta | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todas' | EstadoVenta>('todas');

  const ventasQuery = useQuery({
    queryKey: ['ventas'],
    queryFn: () => ventasService.listarVentas(),
  });
  const pedidosQuery = useQuery({ queryKey: ['pedidos'], queryFn: pedidosService.listarPedidos });
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
            render: (v) => (
              <button
                type="button"
                onClick={() => setVentaViendo(v)}
                className="font-medium text-orange-600 hover:text-orange-700 hover:underline"
              >
                {v.tipoComprobante.nombre} {numeroComprobante(v)}
              </button>
            ),
          },
          { encabezado: 'Fecha emisión', render: (v) => formatearFechaHora(v.creadoEn) },
          {
            encabezado: 'Mesa',
            render: (v) => `${v.pedido.mesa.salon.nombre} — ${v.pedido.mesa.numero}`,
          },
          { encabezado: 'Cliente', render: (v) => nombreCliente(v.cliente) },
          { encabezado: 'Subtotal', render: (v) => formatearPrecio(v.subtotal) },
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
                <button
                  type="button"
                  onClick={() => setVentaViendo(v)}
                  className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver
                </button>
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

          <Controller
            control={crearForm.control}
            name="clienteId"
            rules={{ required: esFactura }}
            render={({ field }) => (
              <BuscadorCliente
                clienteId={field.value}
                onCambiar={field.onChange}
                requerido={esFactura}
                ayuda={
                  esFactura ? 'Una factura requiere un cliente con RUC registrado.' : undefined
                }
              />
            )}
          />

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

      <VentaDetalleModal venta={ventaViendo} onCerrar={() => setVentaViendo(null)} />

      <ConfirmDialog
        abierto={ventaAnulando !== null}
        titulo="Anular venta"
        mensaje={`¿Seguro que deseas anular el comprobante ${ventaAnulando ? numeroComprobante(ventaAnulando) : ''}? Esta acción no se puede deshacer.`}
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
