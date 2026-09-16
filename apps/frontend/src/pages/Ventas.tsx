import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import {
  BookMarked,
  ClipboardList,
  CreditCard,
  Eye,
  FileMinus2,
  FilePlus2,
  MapPin,
  Plus,
  Landmark,
  Printer,
  Receipt,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Utensils,
  UserRound,
  XCircle,
} from 'lucide-react';
import * as ventasService from '../services/ventas.service';
import * as pedidosService from '../services/pedidos.service';
import * as productosService from '../services/productos.service';
import * as clientesService from '../services/clientes.service';
import * as catalogosService from '../services/catalogos.service';
import * as talonariosService from '../services/talonarios.service';
import * as facturacionService from '../services/facturacion.service';
import * as notasVentaService from '../services/notas-venta.service';
import * as configuracionService from '../services/configuracion.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { BuscadorCliente } from '../components/BuscadorCliente';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { FormActions } from '../components/ui/FormActions';
import { TarjetaOpcion } from '../components/ui/TarjetaOpcion';
import { SeccionFormulario } from '../components/ui/SeccionFormulario';
import { EmptyState } from '../components/ui/EmptyState';
import {
  formatearFechaHora,
  formatearPrecio,
  nombreCliente,
  nombreMesa,
  numeroComprobante,
  origenVenta,
  urlImagen,
} from '../utils/formato';
import { mensajeError } from '../utils/errores';
import { minutosDesde } from '../utils/estadoMesa';
import type { CrearVentaInput, LineaVentaInput } from '../services/ventas.service';
import type {
  CrearNotaCreditoInput,
  CrearNotaDebitoInput,
} from '../services/notas-venta.service';
import type { EstadoComprobante, EstadoVenta, NotaVenta, Pedido, Venta } from '../types/api';

const CODIGO_FACTURA = '01';
const MAXIMO_LINEAS_DIRECTAS = 50;

const ETIQUETA_ESTADO: Record<EstadoVenta, string> = {
  emitida: 'Emitida',
  anulada: 'Anulada',
};

const TONO_ESTADO: Record<EstadoVenta, 'exito' | 'neutral' | 'peligro'> = {
  emitida: 'exito',
  anulada: 'peligro',
};

/** Origen de una venta al crearla: desde un pedido cerrado (flujo original) o directa,
 * agregando productos sin depender de que exista un pedido facturable. */
type ModoVenta = 'pedido' | 'directa';

const ETIQUETA_ESTADO_COMPROBANTE: Record<EstadoComprobante, string> = {
  pendiente: 'Pendiente',
  aceptado: 'Aceptado por SUNAT',
  observado: 'Aceptado con observaciones',
  rechazado: 'Rechazado',
  error_envio: 'No se pudo enviar',
};

const TONO_ESTADO_COMPROBANTE: Record<EstadoComprobante, 'exito' | 'neutral' | 'peligro'> = {
  pendiente: 'neutral',
  aceptado: 'exito',
  // Sigue siendo un comprobante válido ante SUNAT (solo con observaciones) — no es un tono de
  // alarma como el rechazo o el error de envío.
  observado: 'neutral',
  rechazado: 'peligro',
  error_envio: 'peligro',
};

/**
 * Estado del comprobante electrónico de una venta, con acción para emitir/reintentar (FASE
 * 28). Vive dentro de `VentaDetalleModal` y no en la tabla principal: es una acción posterior
 * a la venta, con su propio round-trip al OSE, no algo que deba cargarse por cada fila listada.
 */
function SeccionComprobanteElectronico({ ventaId }: { ventaId: string }) {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const comprobanteQuery = useQuery({
    queryKey: ['comprobante-electronico', ventaId],
    queryFn: () => facturacionService.obtenerComprobanteDeVenta(ventaId),
    enabled: tienePermiso('facturacion.ver'),
  });

  function alExito() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ['comprobante-electronico', ventaId] });
  }

  const emitirMutation = useMutation({
    mutationFn: () => facturacionService.emitirComprobante(ventaId),
    onSuccess: alExito,
    onError: (excepcion) => setError(mensajeError(excepcion, 'No se pudo emitir el comprobante')),
  });
  const reintentarMutation = useMutation({
    mutationFn: (comprobanteId: string) => facturacionService.reintentarEnvio(comprobanteId),
    onSuccess: alExito,
    onError: (excepcion) => setError(mensajeError(excepcion, 'No se pudo reintentar el envío')),
  });

  if (!tienePermiso('facturacion.ver') || comprobanteQuery.isLoading) return null;

  const comprobante = comprobanteQuery.data;

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-700">SUNAT</span>
          {comprobante ? (
            <Badge tono={TONO_ESTADO_COMPROBANTE[comprobante.estado]}>
              {ETIQUETA_ESTADO_COMPROBANTE[comprobante.estado]}
            </Badge>
          ) : (
            <Badge tono="neutral">Sin emitir</Badge>
          )}
        </div>
        {tienePermiso('facturacion.emitir') && (
          <>
            {!comprobante && (
              <Button
                variante="secondary"
                cargando={emitirMutation.isPending}
                onClick={() => emitirMutation.mutate()}
              >
                Emitir a SUNAT
              </Button>
            )}
            {comprobante?.estado === 'error_envio' && (
              <Button
                variante="secondary"
                cargando={reintentarMutation.isPending}
                onClick={() => reintentarMutation.mutate(comprobante.id)}
              >
                Reintentar envío
              </Button>
            )}
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {comprobante?.mensajeRespuesta && comprobante.estado !== 'aceptado' && (
        <p className="mt-2 text-xs text-zinc-600">{comprobante.mensajeRespuesta}</p>
      )}
    </div>
  );
}

const ETIQUETA_ESTADO_NOTA = ETIQUETA_ESTADO_COMPROBANTE;
const TONO_ESTADO_NOTA = TONO_ESTADO_COMPROBANTE;

/** Talonarios (del usuario autenticado) y motivos disponibles para un tipo de nota — comparten
 * la misma consulta de `['tipos-comprobante']` que ya usa el formulario de venta directa más
 * abajo, así que no hay una segunda llamada de red. */
function useDatosNota(tipoComprobanteCodigo: '07' | '08') {
  const tiposComprobanteQuery = useQuery({
    queryKey: ['tipos-comprobante'],
    queryFn: catalogosService.listarTiposComprobante,
  });
  const tipoComprobante = tiposComprobanteQuery.data?.find(
    (t) => t.codigo === tipoComprobanteCodigo,
  );
  const talonariosQuery = useQuery({
    queryKey: ['mis-talonarios', tipoComprobante?.id],
    queryFn: () => talonariosService.listarMisTalonarios(tipoComprobante!.id),
    enabled: !!tipoComprobante,
  });
  const motivosQuery = useQuery({
    queryKey: ['motivos-nota', tipoComprobanteCodigo],
    queryFn: () => catalogosService.listarMotivosNota(tipoComprobanteCodigo),
  });
  return { talonarios: talonariosQuery.data ?? [], motivos: motivosQuery.data ?? [] };
}

function invalidarNotasDeVenta(queryClient: ReturnType<typeof useQueryClient>, ventaId: string) {
  queryClient.invalidateQueries({ queryKey: ['notas-de-venta', ventaId] });
  queryClient.invalidateQueries({ queryKey: ['ventas'] });
}

function NotaCreditoModal({
  ventaId,
  abierto,
  onCerrar,
}: {
  ventaId: string;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const { talonarios, motivos } = useDatosNota('07');
  const form = useForm<Omit<CrearNotaCreditoInput, 'ventaId'>>();

  const mutation = useMutation({
    mutationFn: (values: Omit<CrearNotaCreditoInput, 'ventaId'>) =>
      notasVentaService.crearNotaCredito({ ...values, ventaId }),
    onSuccess: () => {
      invalidarNotasDeVenta(queryClient, ventaId);
      cerrar();
    },
  });

  function cerrar() {
    form.reset({ talonarioId: '', motivoId: '', descripcionSustento: '' });
    mutation.reset();
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Nota de crédito"
      descripcion="Corrige el 100% de esta venta: anulación, devolución total, error de RUC, etc."
      onCerrar={cerrar}
    >
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
        noValidate
      >
        {mutation.isError && (
          <Alert
            tipo="error"
            mensaje={mensajeError(mutation.error, 'No se pudo registrar la nota de crédito')}
          />
        )}
        <Select
          label="Talonario"
          error={form.formState.errors.talonarioId?.message}
          {...form.register('talonarioId', { required: 'Elige un talonario' })}
        >
          <option value="">Selecciona…</option>
          {talonarios.map((t) => (
            <option key={t.id} value={t.id}>
              {t.serie}
            </option>
          ))}
        </Select>
        <Select
          label="Motivo"
          error={form.formState.errors.motivoId?.message}
          {...form.register('motivoId', { required: 'Elige un motivo' })}
        >
          <option value="">Selecciona…</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
        <Input
          label="Sustento adicional (opcional)"
          placeholder="Ej. el cliente devolvió el plato por error del mozo"
          {...form.register('descripcionSustento')}
        />
        <FormActions
          enviar="Registrar nota de crédito"
          enviandoTexto="Registrando…"
          onCancelar={cerrar}
          enviando={form.formState.isSubmitting || mutation.isPending}
          variante="danger"
        />
      </form>
    </Modal>
  );
}

function NotaDebitoModal({
  ventaId,
  abierto,
  onCerrar,
}: {
  ventaId: string;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const { talonarios, motivos } = useDatosNota('08');
  const form = useForm<Omit<CrearNotaDebitoInput, 'ventaId'>>();

  const mutation = useMutation({
    mutationFn: (values: Omit<CrearNotaDebitoInput, 'ventaId'>) =>
      notasVentaService.crearNotaDebito({ ...values, ventaId }),
    onSuccess: () => {
      invalidarNotasDeVenta(queryClient, ventaId);
      cerrar();
    },
  });

  function cerrar() {
    form.reset({ talonarioId: '', motivoId: '', concepto: '', descripcionSustento: '' });
    mutation.reset();
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Nota de débito"
      descripcion="Un cargo adicional sobre esta venta: interés, penalidad, aumento de valor…"
      onCerrar={cerrar}
    >
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-4"
        noValidate
      >
        {mutation.isError && (
          <Alert
            tipo="error"
            mensaje={mensajeError(mutation.error, 'No se pudo registrar la nota de débito')}
          />
        )}
        <Select
          label="Talonario"
          error={form.formState.errors.talonarioId?.message}
          {...form.register('talonarioId', { required: 'Elige un talonario' })}
        >
          <option value="">Selecciona…</option>
          {talonarios.map((t) => (
            <option key={t.id} value={t.id}>
              {t.serie}
            </option>
          ))}
        </Select>
        <Select
          label="Motivo"
          error={form.formState.errors.motivoId?.message}
          {...form.register('motivoId', { required: 'Elige un motivo' })}
        >
          <option value="">Selecciona…</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
        <Input
          label="Concepto"
          placeholder="Ej. interés por pago fuera de plazo"
          error={form.formState.errors.concepto?.message}
          {...form.register('concepto', { required: 'Describe el concepto', minLength: 3 })}
        />
        <Input
          label="Monto (incluye IGV)"
          type="number"
          step="0.01"
          min="0.01"
          error={form.formState.errors.monto?.message}
          {...form.register('monto', {
            required: 'Indica el monto',
            valueAsNumber: true,
            min: { value: 0.01, message: 'Debe ser mayor a 0' },
          })}
        />
        <FormActions
          enviar="Registrar nota de débito"
          enviandoTexto="Registrando…"
          onCancelar={cerrar}
          enviando={form.formState.isSubmitting || mutation.isPending}
        />
      </form>
    </Modal>
  );
}

/**
 * Notas de Crédito/Débito de esta venta: única forma legal de corregirla o complementarla una
 * vez que SUNAT aceptó su comprobante (ver `nota-venta.service.ts` en el backend). Vive dentro
 * de `VentaDetalleModal`, junto a `SeccionComprobanteElectronico`, por el mismo motivo — es una
 * acción posterior con su propio ciclo de emisión al OSE.
 */
function SeccionNotasVenta({ ventaId }: { ventaId: string }) {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalCredito, setModalCredito] = useState(false);
  const [modalDebito, setModalDebito] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notasQuery = useQuery({
    queryKey: ['notas-de-venta', ventaId],
    queryFn: () => notasVentaService.listarNotasDeVenta(ventaId),
    enabled: tienePermiso('notas_venta.ver'),
  });

  function alExito() {
    setError(null);
    invalidarNotasDeVenta(queryClient, ventaId);
  }

  const emitirMutation = useMutation({
    mutationFn: (notaId: string) => notasVentaService.emitirNota(notaId),
    onSuccess: alExito,
    onError: (excepcion) => setError(mensajeError(excepcion, 'No se pudo emitir la nota')),
  });
  const reintentarMutation = useMutation({
    mutationFn: (notaId: string) => notasVentaService.reintentarEnvioNota(notaId),
    onSuccess: alExito,
    onError: (excepcion) => setError(mensajeError(excepcion, 'No se pudo reintentar el envío')),
  });

  if (!tienePermiso('notas_venta.ver')) return null;

  const notas = notasQuery.data ?? [];

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-700">Notas de crédito/débito</span>
        {tienePermiso('notas_venta.crear') && (
          <div className="flex gap-2">
            <Button
              variante="secondary"
              icono={<FileMinus2 className="h-4 w-4" />}
              onClick={() => setModalCredito(true)}
            >
              Nota de crédito
            </Button>
            <Button
              variante="secondary"
              icono={<FilePlus2 className="h-4 w-4" />}
              onClick={() => setModalDebito(true)}
            >
              Nota de débito
            </Button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {notas.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {notas.map((n: NotaVenta) => (
            <li
              key={n.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium text-zinc-900">
                  {n.tipoComprobante.codigo === '07' ? 'NC' : 'ND'} {numeroComprobante(n.serie, n.numero)}
                </span>
                <span className="ml-2 text-zinc-500">{n.motivo.nombre}</span>
                <span className="ml-2 font-medium text-zinc-700">{formatearPrecio(n.total)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tono={TONO_ESTADO_NOTA[n.estado]}>{ETIQUETA_ESTADO_NOTA[n.estado]}</Badge>
                {tienePermiso('notas_venta.emitir') && n.estado === 'pendiente' && (
                  <Button
                    variante="secondary"
                    cargando={emitirMutation.isPending}
                    onClick={() => emitirMutation.mutate(n.id)}
                  >
                    Emitir
                  </Button>
                )}
                {tienePermiso('notas_venta.emitir') && n.estado === 'error_envio' && (
                  <Button
                    variante="secondary"
                    cargando={reintentarMutation.isPending}
                    onClick={() => reintentarMutation.mutate(n.id)}
                  >
                    Reintentar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <NotaCreditoModal
        ventaId={ventaId}
        abierto={modalCredito}
        onCerrar={() => setModalCredito(false)}
      />
      <NotaDebitoModal
        ventaId={ventaId}
        abierto={modalDebito}
        onCerrar={() => setModalDebito(false)}
      />
    </div>
  );
}

function VentaDetalleModal({ venta, onCerrar }: { venta: Venta | null; onCerrar: () => void }) {
  return (
    <Modal
      abierto={venta !== null}
      titulo={
        venta
          ? `${venta.tipoComprobante.nombre} ${numeroComprobante(venta.serie, venta.numero)}`
          : ''
      }
      onCerrar={onCerrar}
    >
      {venta && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-zinc-500">Fecha de emisión</p>
              <p className="font-medium text-zinc-900">{formatearFechaHora(venta.creadoEn)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tono={TONO_ESTADO[venta.estado]}>{ETIQUETA_ESTADO[venta.estado]}</Badge>
              <Button
                variante="secondary"
                icono={<Printer className="h-4 w-4" />}
                onClick={() => window.open(`/imprimir/venta/${venta.id}`, '_blank')}
              >
                Imprimir
              </Button>
            </div>
          </div>

          {venta.estado === 'emitida' && <SeccionComprobanteElectronico ventaId={venta.id} />}
          <SeccionNotasVenta ventaId={venta.id} />

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div>
              <p className="text-zinc-500">Origen</p>
              <p className="font-medium text-zinc-900">{origenVenta(venta)}</p>
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
              <span>IGV</span>
              <span>{formatearPrecio(venta.igv)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-bold text-zinc-900">
              <span>Total</span>
              <span>{formatearPrecio(venta.total)}</span>
            </div>
            {venta.propina > 0 && (
              <>
                <div className="flex justify-between text-zinc-600">
                  <span>Propina</span>
                  <span>{formatearPrecio(venta.propina)}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-200 pt-1.5 text-base font-bold text-zinc-900">
                  <span>Total cobrado</span>
                  <span>{formatearPrecio(venta.total + venta.propina)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

interface SelectorPedidoFacturableProps {
  pedidos: Pedido[];
  seleccionadoId?: string;
  onSeleccionar: (pedidoId: string) => void;
}

/**
 * Grilla de "tickets" para elegir el pedido a facturar, en vez del combo de texto que había
 * antes: mesa/para llevar, cliente, total y hace cuánto se cerró, todo visible de un vistazo.
 * Vive dentro de su propio modal (`capa="superior"`), no embebida en el formulario de "Nueva
 * venta": ese formulario ya tiene varias secciones, y una grilla con buscador lo habría hecho
 * más largo y pesado de recorrer. En el formulario solo queda un botón o un resumen compacto
 * (ver más abajo) — elegir es una tarea aparte con su propio espacio, no un campo más.
 */
function SelectorPedidoFacturable({
  pedidos,
  seleccionadoId,
  onSeleccionar,
}: SelectorPedidoFacturableProps) {
  const [filtro, setFiltro] = useState('');

  if (pedidos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 py-8 text-center text-sm text-zinc-500">
        No hay pedidos cerrados pendientes de facturar
      </div>
    );
  }

  const filtrados = pedidos.filter((pedido) => {
    if (!filtro.trim()) return true;
    const texto =
      `${nombreMesa(pedido.mesa)} ${pedido.cliente ? nombreCliente(pedido.cliente) : ''}`.toLowerCase();
    return texto.includes(filtro.trim().toLowerCase());
  });

  return (
    <div className="flex flex-col gap-2">
      {pedidos.length > 5 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={filtro}
            onChange={(evento) => setFiltro(evento.target.value)}
            placeholder="Buscar por mesa o cliente…"
            className="w-full rounded-lg border border-zinc-300 py-1.5 pr-3 pl-8 text-sm placeholder:text-zinc-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 sm:grid-cols-2">
        {filtrados.length === 0 ? (
          <p className="col-span-full py-4 text-center text-xs text-zinc-500">
            Ningún pedido coincide con &quot;{filtro}&quot;
          </p>
        ) : (
          filtrados.map((pedido, indice) => {
            const seleccionado = pedido.id === seleccionadoId;
            return (
              <button
                key={pedido.id}
                type="button"
                onClick={() => onSeleccionar(pedido.id)}
                style={{ animationDelay: `${Math.min(indice, 12) * 20}ms` }}
                className={`animar-entrada flex flex-col gap-1 rounded-lg border bg-white p-2.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
                  seleccionado
                    ? 'border-orange-500 ring-2 ring-orange-500 ring-offset-1'
                    : 'border-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-900">
                    {pedido.mesa ? (
                      <Utensils className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    ) : (
                      <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    )}
                    <span className="truncate">{nombreMesa(pedido.mesa)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-zinc-900">
                    {formatearPrecio(pedido.total)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                  <span className="min-w-0 truncate">
                    {pedido.cliente ? nombreCliente(pedido.cliente) : 'Sin cliente'}
                  </span>
                  <span className="shrink-0">
                    {pedido.detalles.length}{' '}
                    {pedido.detalles.length === 1 ? 'producto' : 'productos'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  hace {minutosDesde(pedido.creadoEn)} min
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function Ventas() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [ventaViendo, setVentaViendo] = useState<Venta | null>(null);
  const [ventaAnulando, setVentaAnulando] = useState<Venta | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todas' | EstadoVenta>('todas');
  // No depende únicamente de que haya un pedido cerrado disponible: "Venta directa" agrega
  // productos sin necesitar ningún pedido de por medio.
  const [modo, setModo] = useState<ModoVenta>('pedido');
  const [selectorPedidoAbierto, setSelectorPedidoAbierto] = useState(false);
  const [productoStaging, setProductoStaging] = useState<string | undefined>(undefined);
  const [cantidadStaging, setCantidadStaging] = useState(1);
  const [errorCarrito, setErrorCarrito] = useState<string | null>(null);
  // Aviso cuando el número que finalmente se emitió no es el que mostraba el formulario:
  // otro cajero tomó ese correlativo primero (ver `venta.service.ts: guardarReintentandoColision`).
  const [avisoCorrelativo, setAvisoCorrelativo] = useState<string | null>(null);

  const ventasQuery = useQuery({
    queryKey: ['ventas'],
    queryFn: () => ventasService.listarVentas(),
  });
  const pedidosQuery = useQuery({ queryKey: ['pedidos'], queryFn: pedidosService.listarPedidos });
  const productosQuery = useQuery({
    queryKey: ['productos'],
    queryFn: productosService.listarProductos,
  });
  // Mismo queryKey que usa internamente BuscadorCliente: comparten caché, no se duplica la
  // llamada. Se necesita aquí para mostrar los datos completos del cliente del pedido elegido
  // (documento, dirección) en la vista previa — `pedido.cliente` solo trae nombre/id.
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
  const bancosQuery = useQuery({ queryKey: ['bancos'], queryFn: catalogosService.listarBancos });
  // Solo hace falta para mostrar el QR de cobro al elegir Yape/Plin — no bloquea el resto del
  // formulario si todavía no se subió ninguno.
  const configuracionQuery = useQuery({
    queryKey: ['configuracion'],
    queryFn: configuracionService.obtenerConfiguracion,
    enabled: modalAbierto,
  });

  const tiposComprobanteFacturables = (tiposComprobanteQuery.data ?? []).filter(
    (t) => t.codigo === '01' || t.codigo === '03',
  );

  const pedidosFacturables = (pedidosQuery.data ?? []).filter(
    (p) =>
      p.estado === 'cerrado' &&
      !(ventasQuery.data ?? []).some((v) => v.pedido?.id === p.id && v.estado === 'emitida'),
  );

  const opcionesMediosPago: OpcionCombobox[] = (mediosPagoQuery.data ?? []).map((m) => ({
    valor: m.id,
    etiqueta: m.nombre,
  }));

  const productosActivos = (productosQuery.data ?? []).filter((p) => p.activo);
  const opcionesProductos: OpcionCombobox[] = productosActivos.map((p) => ({
    valor: p.id,
    etiqueta: p.nombre,
    descripcion: formatearPrecio(p.precio),
  }));

  const crearForm = useForm<CrearVentaInput>({
    defaultValues: { formaPago: 'contado', detalles: [] },
  });
  const carrito = useFieldArray({ control: crearForm.control, name: 'detalles' });
  const tipoComprobanteId = useWatch({ control: crearForm.control, name: 'tipoComprobanteId' });
  const talonarioId = useWatch({ control: crearForm.control, name: 'talonarioId' });
  const formaPago = useWatch({ control: crearForm.control, name: 'formaPago' });
  const pedidoIdSeleccionado = useWatch({ control: crearForm.control, name: 'pedidoId' });
  const medioPagoId = useWatch({ control: crearForm.control, name: 'medioPagoId' });
  const lineasCarrito = useWatch({ control: crearForm.control, name: 'detalles' }) ?? [];
  const esFactura =
    tiposComprobanteFacturables.find((t) => t.id === tipoComprobanteId)?.codigo === CODIGO_FACTURA;
  const esCredito = formaPago === 'credito';
  // Qué medios exigen banco lo dice el catálogo (`requiereBanco`), no una lista de códigos:
  // agregar un medio bancarizado nuevo no obliga a tocar esta pantalla. Al crédito el dinero
  // aún no entró, así que el banco se pide recién al cobrar (Cuentas por cobrar).
  const exigeBanco =
    !esCredito &&
    ((mediosPagoQuery.data ?? []).find((m) => m.id === medioPagoId)?.requiereBanco ?? false);
  // QR de cobro (FASE de pagos digitales): solo tiene sentido mostrarlo cuando el medio
  // elegido es Yape o Plin y el restaurante ya subió su QR en Configuración.
  const codigoMedioPago = (mediosPagoQuery.data ?? []).find((m) => m.id === medioPagoId)?.codigo;
  const qrPagoAMostrar =
    codigoMedioPago === 'yape'
      ? configuracionQuery.data?.qrPagoYape
      : codigoMedioPago === 'plin'
        ? configuracionQuery.data?.qrPagoPlin
        : null;
  const propinaIngresada = useWatch({ control: crearForm.control, name: 'propina' }) || 0;

  // Talonarios que ESTE usuario puede usar para el comprobante elegido — el backend ya
  // descarta los ajenos, los inactivos y los agotados (`talonario.service.ts`). Se consulta
  // recién al elegir el comprobante, porque la serie y el correlativo dependen de él.
  const talonariosQuery = useQuery({
    queryKey: ['talonarios-mios', tipoComprobanteId],
    queryFn: () => talonariosService.listarMisTalonarios(tipoComprobanteId),
    enabled: modalAbierto && Boolean(tipoComprobanteId),
  });
  const talonariosDisponibles = talonariosQuery.data ?? [];
  const talonarioSeleccionado = talonariosDisponibles.find((t) => t.id === talonarioId);

  /** Número que el formulario está mostrando como "el que se va a emitir". Se compara con el
   * que devuelve el backend para detectar que otro cajero se adelantó. */
  const numeroPrevisto = talonarioSeleccionado?.siguienteNumero ?? null;

  const opcionesTalonarios: OpcionCombobox[] = talonariosDisponibles.map((t) => ({
    valor: t.id,
    etiqueta: t.serie,
    descripcion: `${t.almacen.nombre} · próximo ${t.siguienteNumeroFormateado}`,
  }));

  // Con un solo talonario no hay nada que elegir: se selecciona solo. Si el elegido deja de
  // estar disponible (cambió el comprobante), se limpia para no mandar uno ajeno a la serie.
  useEffect(() => {
    if (talonariosDisponibles.length === 1) {
      crearForm.setValue('talonarioId', talonariosDisponibles[0]!.id);
      return;
    }
    if (talonarioId && !talonariosDisponibles.some((t) => t.id === talonarioId)) {
      crearForm.setValue('talonarioId', undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar la lista disponible
  }, [talonariosQuery.data]);

  const pedidoSeleccionado = pedidosFacturables.find((p) => p.id === pedidoIdSeleccionado);
  // `pedido.cliente` solo trae id/nombre; el registro completo (documento, dirección) se
  // busca en la lista de clientes ya cargada, para mostrarlo en la vista previa.
  const clienteDelPedido = pedidoSeleccionado?.cliente
    ? clientesQuery.data?.find((c) => c.id === pedidoSeleccionado.cliente!.id)
    : undefined;

  // Al elegir (o cambiar) el pedido a facturar, se jala también su cliente hacia el campo
  // "Cliente" del formulario — antes había que volver a buscarlo a mano aunque el pedido ya
  // lo tuviera registrado. Si el pedido no tiene cliente, se limpia (no debe quedar el de un
  // pedido elegido previamente).
  useEffect(() => {
    crearForm.setValue('clienteId', pedidoSeleccionado?.cliente?.id ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de pedido, no en cada render
  }, [pedidoIdSeleccionado]);

  function productoDe(productoId: string) {
    return productosActivos.find((p) => p.id === productoId);
  }

  const totalDirecta = lineasCarrito.reduce((suma, linea) => {
    const producto = productoDe(linea.productoId);
    return suma + (producto ? producto.precio * linea.cantidad : 0);
  }, 0);
  const totalVentaEstimado = (pedidoSeleccionado?.total ?? totalDirecta) + propinaIngresada;

  const crearMutation = useMutation({
    mutationFn: ventasService.crearVenta,
    onSuccess: (venta) => {
      // El correlativo definitivo lo asigna el backend al guardar. Si no coincide con el que
      // este formulario venía mostrando, es que otro cajero emitió antes con la misma serie:
      // su venta se quedó con ese número y esta recibió el siguiente libre. Hay que decirlo,
      // porque el comprobante impreso ya no lleva el número que el cajero tenía a la vista.
      if (numeroPrevisto !== null && venta.numero !== numeroPrevisto) {
        setAvisoCorrelativo(
          `El número ${numeroComprobante(venta.serie, numeroPrevisto)} fue tomado por otra venta registrada antes. Esta venta se emitió como ${numeroComprobante(venta.serie, venta.numero)}.`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['pedidos'] });
      // El talonario avanzó: refrescar su correlativo aquí y en la pantalla de Talonarios.
      queryClient.invalidateQueries({ queryKey: ['talonarios-mios'] });
      queryClient.invalidateQueries({ queryKey: ['talonarios'] });
      queryClient.invalidateQueries({ queryKey: ['cuentas-por-cobrar'] });
      cerrarCrear();
    },
  });

  const anularMutation = useMutation({
    mutationFn: () => ventasService.anularVenta(ventaAnulando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      setVentaAnulando(null);
    },
  });

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset({ formaPago: 'contado', detalles: [] });
    crearMutation.reset();
    setModo('pedido');
    setSelectorPedidoAbierto(false);
    setProductoStaging(undefined);
    setCantidadStaging(1);
    setErrorCarrito(null);
  }

  function elegirModo(nuevo: ModoVenta) {
    setModo(nuevo);
    setErrorCarrito(null);
  }

  function agregarLinea() {
    if (!productoStaging) return;
    const cantidad = Math.max(1, Math.round(cantidadStaging) || 1);
    const indiceExistente = carrito.fields.findIndex((f) => f.productoId === productoStaging);

    if (indiceExistente >= 0) {
      const previa = carrito.fields[indiceExistente];
      carrito.update(indiceExistente, {
        productoId: previa.productoId,
        cantidad: previa.cantidad + cantidad,
      });
    } else {
      if (carrito.fields.length >= MAXIMO_LINEAS_DIRECTAS) return;
      carrito.append({ productoId: productoStaging, cantidad });
    }
    setProductoStaging(undefined);
    setCantidadStaging(1);
    setErrorCarrito(null);
  }

  function cambiarCantidadLinea(indice: number, cantidad: number) {
    const linea = carrito.fields[indice];
    carrito.update(indice, {
      productoId: linea.productoId,
      cantidad: Math.max(1, Math.round(cantidad) || 1),
    });
  }

  function alEnviar(values: CrearVentaInput) {
    // Campos que solo aplican en su escenario: enviarlos fuera de él haría que el backend
    // los validara contra un medio de pago o una forma de pago que ya no corresponde.
    if (!exigeBanco) {
      values.bancoId = undefined;
      values.numeroOperacion = undefined;
    }
    if (!esCredito) {
      values.fechaPrimerVencimiento = undefined;
      values.numeroCuotas = undefined;
    } else {
      values.numeroCuotas = Number(values.numeroCuotas) || 1;
      values.fechaPrimerVencimiento = values.fechaPrimerVencimiento || undefined;
    }

    if (modo === 'directa') {
      if (!values.detalles || values.detalles.length === 0) {
        setErrorCarrito('Agrega al menos un producto antes de registrar la venta');
        return;
      }
      const detalles: LineaVentaInput[] = values.detalles.map((linea) => ({
        productoId: linea.productoId,
        cantidad: linea.cantidad,
      }));
      crearMutation.mutate({ ...values, pedidoId: undefined, detalles });
    } else {
      crearMutation.mutate({ ...values, detalles: undefined });
    }
  }

  const ventas = ventasQuery.data ?? [];
  const ventasFiltradas =
    filtroEstado === 'todas' ? ventas : ventas.filter((v) => v.estado === filtroEstado);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Ventas</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Comprobantes emitidos desde un pedido cerrado o como venta directa
          </p>
        </div>
        {tienePermiso('ventas.crear') && (
          <Button
            icono={<Receipt className="h-4 w-4" />}
            onClick={() => {
              setAvisoCorrelativo(null);
              setModalAbierto(true);
            }}
          >
            Nueva venta
          </Button>
        )}
      </div>

      {avisoCorrelativo && (
        <div className="mb-5">
          <Alert tipo="advertencia" mensaje={avisoCorrelativo} />
        </div>
      )}

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
                {v.tipoComprobante.nombre} {numeroComprobante(v.serie, v.numero)}
              </button>
            ),
          },
          { encabezado: 'Fecha emisión', render: (v) => formatearFechaHora(v.creadoEn) },
          { encabezado: 'Mesa', render: (v) => origenVenta(v) },
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
        cargando={ventasQuery.isLoading}
        error={
          ventasQuery.isError
            ? mensajeError(ventasQuery.error, 'No se pudieron cargar las ventas')
            : undefined
        }
        onReintentar={() => void ventasQuery.refetch()}
      />

      <Modal
        abierto={modalAbierto}
        titulo="Nueva venta"
        descripcion="Factura desde un pedido cerrado o registra una venta directa."
        onCerrar={cerrarCrear}
        tamano="xl"
      >
        <form
          onSubmit={crearForm.handleSubmit(alEnviar)}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo registrar la venta')}
            />
          )}

          <SeccionFormulario
            titulo="Origen de la venta"
            descripcion="De dónde salen los productos que se van a facturar."
            icono={ShoppingCart}
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <TarjetaOpcion
                activo={modo === 'pedido'}
                icono={ClipboardList}
                titulo="Desde un pedido"
                descripcion="Factura el consumo de una mesa o pedido cerrado"
                onClick={() => elegirModo('pedido')}
              />
              <TarjetaOpcion
                activo={modo === 'directa'}
                icono={ShoppingCart}
                titulo="Venta directa"
                descripcion="Agrega productos sin depender de un pedido"
                onClick={() => elegirModo('directa')}
              />
            </div>

            {modo === 'pedido' ? (
              <>
                <Controller
                  control={crearForm.control}
                  name="pedidoId"
                  rules={{
                    required: modo === 'pedido' ? 'Selecciona el pedido a facturar' : false,
                  }}
                  render={({ field, fieldState }) => (
                    <>
                      {!pedidoSeleccionado ? (
                        <FormField
                          id="venta-pedido"
                          label="Pedido a facturar"
                          ayuda="Solo aparecen los pedidos cerrados que aún no tienen comprobante."
                          error={fieldState.error?.message}
                        >
                          <button
                            type="button"
                            id="venta-pedido"
                            onClick={() => setSelectorPedidoAbierto(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-300 py-3.5 text-sm font-medium text-zinc-500 transition-colors hover:border-orange-400 hover:text-orange-600"
                          >
                            <ClipboardList className="h-4 w-4" />
                            Elegir pedido a facturar
                          </button>
                        </FormField>
                      ) : (
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-zinc-900">
                              {pedidoSeleccionado.mesa ? (
                                <Utensils className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                              ) : (
                                <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                              )}
                              <span className="truncate">
                                {nombreMesa(pedidoSeleccionado.mesa)}
                              </span>
                            </span>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className="font-semibold text-zinc-900">
                                {formatearPrecio(pedidoSeleccionado.total)}
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectorPedidoAbierto(true)}
                                className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                              >
                                Cambiar
                              </button>
                            </div>
                          </div>

                          <div className="mt-2 border-t border-zinc-200 pt-2 text-xs">
                            <p className="text-zinc-400">Cliente</p>
                            {pedidoSeleccionado.cliente ? (
                              <>
                                <p className="font-medium text-zinc-700">
                                  {nombreCliente(pedidoSeleccionado.cliente)}
                                </p>
                                <p className="mt-0.5 text-zinc-500">
                                  {clienteDelPedido?.tipoDocumentoIdentidad
                                    ? `${clienteDelPedido.tipoDocumentoIdentidad.nombre}: ${clienteDelPedido.numeroDocumento}`
                                    : 'Sin documento registrado'}
                                </p>
                                {clienteDelPedido?.direccion && (
                                  <p className="mt-0.5 flex items-center gap-1 text-zinc-500">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{clienteDelPedido.direccion}</span>
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="mt-0.5 text-zinc-500">
                                Sin cliente asociado — selecciona uno abajo si el comprobante lo
                                necesita.
                              </p>
                            )}
                          </div>

                          <ul className="mt-2 space-y-1 border-t border-zinc-200 pt-2 text-xs text-zinc-500">
                            {pedidoSeleccionado.detalles.map((detalle) => (
                              <li key={detalle.id} className="flex justify-between gap-2">
                                <span className="min-w-0 truncate">
                                  {detalle.cantidad}× {detalle.producto.nombre}
                                </span>
                                <span className="shrink-0">
                                  {formatearPrecio(detalle.subtotal)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {fieldState.error && !pedidoSeleccionado && (
                        <p className="-mt-3 text-xs text-red-600">{fieldState.error.message}</p>
                      )}

                      <Modal
                        abierto={selectorPedidoAbierto}
                        titulo="Elegir pedido a facturar"
                        descripcion="Solo se muestran los pedidos cerrados que aún no tienen comprobante."
                        onCerrar={() => setSelectorPedidoAbierto(false)}
                        tamano="lg"
                        capa="superior"
                      >
                        <SelectorPedidoFacturable
                          pedidos={pedidosFacturables}
                          seleccionadoId={field.value}
                          onSeleccionar={(pedidoId) => {
                            field.onChange(pedidoId);
                            setSelectorPedidoAbierto(false);
                          }}
                        />
                      </Modal>
                    </>
                  )}
                />
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_100px_auto]">
                  <FormField id="venta-producto" label="Producto">
                    <Combobox
                      id="venta-producto"
                      opciones={opcionesProductos}
                      valor={productoStaging}
                      onCambiar={setProductoStaging}
                      placeholder="Buscar producto…"
                      vacio="No se encontraron productos"
                    />
                  </FormField>
                  <Input
                    label="Cantidad"
                    type="number"
                    min="1"
                    value={cantidadStaging}
                    onChange={(evento) => setCantidadStaging(Number(evento.target.value))}
                  />
                  <Button
                    type="button"
                    icono={<Plus className="h-4 w-4" />}
                    onClick={agregarLinea}
                    disabled={!productoStaging}
                  >
                    Agregar
                  </Button>
                </div>

                {carrito.fields.length === 0 ? (
                  <EmptyState icono={ShoppingCart} titulo="Aún no agregaste productos" />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-zinc-200">
                    <ul className="divide-y divide-zinc-100">
                      {carrito.fields.map((linea, indice) => {
                        const producto = productoDe(linea.productoId);
                        return (
                          <li key={linea.id} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900">
                              {producto?.nombre ?? 'Producto'}
                            </span>
                            <input
                              type="number"
                              min="1"
                              value={linea.cantidad}
                              onChange={(evento) =>
                                cambiarCantidadLinea(indice, Number(evento.target.value))
                              }
                              aria-label={`Cantidad de ${producto?.nombre ?? 'producto'}`}
                              className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-center text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                            />
                            <span className="w-24 shrink-0 text-right text-sm text-zinc-500">
                              {producto && formatearPrecio(producto.precio)}
                            </span>
                            <span className="w-24 shrink-0 text-right text-sm font-semibold text-zinc-900">
                              {producto && formatearPrecio(producto.precio * linea.cantidad)}
                            </span>
                            <button
                              type="button"
                              onClick={() => carrito.remove(indice)}
                              aria-label={`Quitar ${producto?.nombre ?? 'producto'}`}
                              className="shrink-0 text-zinc-400 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="flex justify-end border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900">
                      Total estimado&nbsp;{formatearPrecio(totalDirecta)}
                    </div>
                  </div>
                )}

                {errorCarrito && <p className="text-xs font-medium text-red-600">{errorCarrito}</p>}
              </div>
            )}
          </SeccionFormulario>

          <SeccionFormulario
            titulo="Comprobante"
            descripcion="Serie y correlativo con los que se emitirá esta venta."
            icono={BookMarked}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Tipo de comprobante"
                error={crearForm.formState.errors.tipoComprobanteId?.message}
                {...crearForm.register('tipoComprobanteId', {
                  required: 'Selecciona el tipo de comprobante',
                })}
              >
                <option value="">Seleccionar…</option>
                {tiposComprobanteFacturables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </Select>

              {/* Con más de un talonario hay que elegir; con uno solo se muestra cuál es. */}
              {talonariosDisponibles.length > 1 ? (
                <Controller
                  control={crearForm.control}
                  name="talonarioId"
                  rules={{ required: 'Elige el talonario desde el que vas a emitir' }}
                  render={({ field, fieldState }) => (
                    <FormField
                      id="venta-talonario"
                      label="Talonario *"
                      ayuda="Tienes varias series asignadas para este comprobante."
                      error={fieldState.error?.message}
                    >
                      <Combobox
                        id="venta-talonario"
                        opciones={opcionesTalonarios}
                        valor={field.value}
                        onCambiar={field.onChange}
                        placeholder="Seleccionar serie…"
                        vacio="No tienes talonarios para este comprobante"
                      />
                    </FormField>
                  )}
                />
              ) : (
                <FormField id="venta-talonario-fijo" label="Talonario">
                  <div
                    id="venta-talonario-fijo"
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
                  >
                    {!tipoComprobanteId
                      ? 'Elige primero el tipo de comprobante'
                      : talonariosQuery.isLoading
                        ? 'Cargando…'
                        : talonarioSeleccionado
                          ? `${talonarioSeleccionado.serie} · ${talonarioSeleccionado.almacen.nombre}`
                          : 'Sin talonario asignado — se usará la serie por defecto'}
                  </div>
                </FormField>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-orange-700">Número del comprobante</p>
                <p className="mt-0.5 text-xs text-orange-600/80">
                  {talonarioSeleccionado
                    ? `Quedan ${talonarioSeleccionado.numerosDisponibles} números en esta serie.`
                    : 'Se asigna al registrar la venta.'}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xl font-bold tracking-tight text-orange-700 tabular-nums">
                {talonarioSeleccionado?.siguienteNumeroFormateado ?? '————-————————'}
              </span>
            </div>
          </SeccionFormulario>

          <SeccionFormulario
            titulo="Cliente"
            descripcion="Obligatorio (con RUC) cuando el comprobante es una factura."
            icono={UserRound}
          >
            <Controller
              control={crearForm.control}
              name="clienteId"
              rules={{ required: esFactura ? 'Una factura requiere un cliente con RUC' : false }}
              render={({ field, fieldState }) => (
                <BuscadorCliente
                  clienteId={field.value}
                  onCambiar={field.onChange}
                  requerido={esFactura}
                  error={fieldState.error?.message}
                  ayuda={
                    esFactura ? 'Una factura requiere un cliente con RUC registrado.' : undefined
                  }
                />
              )}
            />
          </SeccionFormulario>

          <SeccionFormulario titulo="Pago" icono={CreditCard}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Forma de pago" {...crearForm.register('formaPago')}>
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </Select>

              <Controller
                control={crearForm.control}
                name="medioPagoId"
                rules={{
                  required:
                    formaPago === 'contado' ? 'Indica con qué se pagó (efectivo, tarjeta…)' : false,
                }}
                render={({ field, fieldState }) => (
                  <FormField
                    id="venta-medio-pago"
                    label={formaPago === 'contado' ? 'Medio de pago *' : 'Medio de pago'}
                    error={fieldState.error?.message}
                  >
                    <Combobox
                      id="venta-medio-pago"
                      opciones={opcionesMediosPago}
                      valor={field.value}
                      onCambiar={field.onChange}
                      placeholder="Seleccionar…"
                      vacio="No hay medios de pago"
                    />
                  </FormField>
                )}
              />
            </div>

            {/* Propina voluntaria: no paga IGV, se cobra aparte del comprobante (ver
                `Venta.propina` en el backend). */}
            <Input
              label="Propina (opcional)"
              type="number"
              min="0"
              step="0.10"
              ayuda="No forma parte del comprobante — se suma al monto que el cliente entrega."
              {...crearForm.register('propina', { valueAsNumber: true, min: 0 })}
            />

            {/* QR de cobro: solo si el medio elegido es Yape/Plin y ya hay uno subido en
                Configuración — es estático, así que el cajero lo exhibe junto al monto. */}
            {qrPagoAMostrar && (
              <div className="flex items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <img
                  src={urlImagen(qrPagoAMostrar)!}
                  alt="QR de cobro"
                  className="h-24 w-24 rounded-lg border border-zinc-200 bg-white object-contain"
                />
                <div className="text-sm text-zinc-600">
                  <p className="font-medium text-zinc-900">Muestra este QR al cliente</p>
                  <p>Monto a cobrar: {formatearPrecio(totalVentaEstimado)}</p>
                </div>
              </div>
            )}

            {/* Solo si el cobro entró por el sistema financiero: en efectivo no hay banco
                que consignar. Ley 28194 (bancarización). */}
            {exigeBanco && (
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
                <Select
                  label="Banco *"
                  ayuda="Entidad por la que entró el dinero."
                  error={crearForm.formState.errors.bancoId?.message}
                  {...crearForm.register('bancoId', {
                    required: exigeBanco ? 'Indica el banco' : false,
                  })}
                >
                  <option value="">Seleccionar…</option>
                  {(bancosQuery.data ?? []).map((banco) => (
                    <option key={banco.id} value={banco.id}>
                      {banco.nombre}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Número de operación *"
                  placeholder="Ej. 00123456"
                  error={crearForm.formState.errors.numeroOperacion?.message}
                  {...crearForm.register('numeroOperacion', {
                    required: exigeBanco ? 'Indica el número de operación' : false,
                  })}
                />
              </div>
            )}

            {/* Un comprobante al crédito debe llevar su cronograma de cuotas
                (RS 193-2020/SUNAT). El cobro se registra después en Cuentas por cobrar. */}
            {esCredito && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-amber-800">
                  <Landmark className="h-3.5 w-3.5" />
                  Esta venta queda como documento por cobrar. SUNAT exige el cronograma de cuotas en
                  el comprobante.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Primer vencimiento"
                    type="date"
                    ayuda="Si lo dejas vacío, se toma a 30 días."
                    {...crearForm.register('fechaPrimerVencimiento')}
                  />
                  <Input
                    label="Número de cuotas"
                    type="number"
                    min="1"
                    max="36"
                    ayuda="Mensuales, desde el primer vencimiento."
                    error={crearForm.formState.errors.numeroCuotas?.message}
                    {...crearForm.register('numeroCuotas', {
                      min: { value: 1, message: 'Mínimo 1 cuota' },
                      max: { value: 36, message: 'Máximo 36 cuotas' },
                    })}
                  />
                </div>
              </div>
            )}
          </SeccionFormulario>

          <FormActions
            enviar="Registrar venta"
            enviandoTexto="Registrando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <VentaDetalleModal venta={ventaViendo} onCerrar={() => setVentaViendo(null)} />

      <ConfirmDialog
        abierto={ventaAnulando !== null}
        titulo="Anular venta"
        mensaje={`¿Seguro que deseas anular el comprobante ${ventaAnulando ? numeroComprobante(ventaAnulando.serie, ventaAnulando.numero) : ''}? Esta acción no se puede deshacer.`}
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
