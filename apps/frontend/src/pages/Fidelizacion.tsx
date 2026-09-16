import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { Gift, Minus, Plus, Star } from 'lucide-react';
import * as fidelizacionService from '../services/fidelizacion.service';
import * as configuracionService from '../services/configuracion.service';
import { useAuth } from '../context/AuthContext';
import { BuscadorCliente } from '../components/BuscadorCliente';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormActions } from '../components/ui/FormActions';
import {
  formatearFechaHora,
  formatearPrecio,
  nombreCliente,
  nombrePersonal,
} from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type { AjustarPuntosInput } from '../services/fidelizacion.service';
import type { TipoMovimientoFidelizacion } from '../types/api';

const ETIQUETA_TIPO: Record<TipoMovimientoFidelizacion, string> = {
  ganado: 'Ganado',
  canjeado: 'Canjeado',
  ajuste: 'Ajuste',
};

const TONO_TIPO: Record<TipoMovimientoFidelizacion, 'exito' | 'neutral' | 'peligro'> = {
  ganado: 'exito',
  canjeado: 'neutral',
  ajuste: 'neutral',
};

function invalidarFidelizacion(queryClient: ReturnType<typeof useQueryClient>, clienteId?: string) {
  queryClient.invalidateQueries({ queryKey: ['fidelizacion-clientes'] });
  if (clienteId) queryClient.invalidateQueries({ queryKey: ['fidelizacion-detalle', clienteId] });
}

function AjustarPuntosModal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<AjustarPuntosInput>();
  const clienteId = useWatch({ control: form.control, name: 'clienteId' });

  const mutation = useMutation({
    mutationFn: (values: AjustarPuntosInput) => fidelizacionService.ajustarPuntos(values),
    onSuccess: (_datos, valores) => {
      invalidarFidelizacion(queryClient, valores.clienteId);
      cerrar();
    },
  });

  function cerrar() {
    form.reset({ clienteId: undefined, puntos: undefined, observacion: '' });
    mutation.reset();
    onCerrar();
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Ajustar puntos"
      descripcion="Corrección manual — puntos de cortesía, o revertir un error. Usa un número negativo para restar."
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
            mensaje={mensajeError(mutation.error, 'No se pudo registrar el ajuste')}
          />
        )}
        <BuscadorCliente
          clienteId={clienteId}
          onCambiar={(nuevoClienteId) => form.setValue('clienteId', nuevoClienteId ?? '')}
          requerido
        />
        <Input
          label="Puntos (usa negativo para restar)"
          type="number"
          error={form.formState.errors.puntos?.message}
          {...form.register('puntos', {
            valueAsNumber: true,
            required: 'Indica los puntos',
            validate: (valor) => valor !== 0 || 'No puede ser 0',
          })}
        />
        <Input
          label="Motivo"
          placeholder="Ej. puntos de cortesía por su cumpleaños"
          error={form.formState.errors.observacion?.message}
          {...form.register('observacion', { required: 'Indica el motivo del ajuste' })}
        />
        <FormActions
          enviar="Registrar ajuste"
          enviandoTexto="Registrando…"
          onCancelar={cerrar}
          enviando={form.formState.isSubmitting || mutation.isPending}
        />
      </form>
    </Modal>
  );
}

function ClienteDetalleModal({
  clienteId,
  puedeGestionar,
  onCerrar,
}: {
  clienteId: string | null;
  puedeGestionar: boolean;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [formCanjeAbierto, setFormCanjeAbierto] = useState(false);
  const form = useForm<{ puntos: number; observacion?: string }>();

  const detalleQuery = useQuery({
    queryKey: ['fidelizacion-detalle', clienteId],
    queryFn: () => fidelizacionService.obtenerDetalleCliente(clienteId!),
    enabled: clienteId !== null,
  });

  const canjearMutation = useMutation({
    mutationFn: (values: { puntos: number; observacion?: string }) =>
      fidelizacionService.canjearPuntos({ clienteId: clienteId!, ...values }),
    onSuccess: () => {
      invalidarFidelizacion(queryClient, clienteId!);
      form.reset({ puntos: undefined, observacion: '' });
      setFormCanjeAbierto(false);
    },
  });

  function cerrar() {
    setFormCanjeAbierto(false);
    canjearMutation.reset();
    form.reset({ puntos: undefined, observacion: '' });
    onCerrar();
  }

  const saldo = detalleQuery.data?.saldo ?? 0;

  return (
    <Modal
      abierto={clienteId !== null}
      titulo="Movimientos de puntos"
      onCerrar={cerrar}
      tamano="lg"
    >
      {detalleQuery.data && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div>
              <p className="text-xs text-zinc-500 uppercase">Saldo actual</p>
              <p className="text-2xl font-bold text-zinc-900">{saldo} pts</p>
            </div>
            {puedeGestionar && saldo > 0 && (
              <Button
                variante="secondary"
                icono={<Minus className="h-4 w-4" />}
                onClick={() => setFormCanjeAbierto((v) => !v)}
              >
                Canjear
              </Button>
            )}
          </div>

          {formCanjeAbierto && (
            <form
              onSubmit={form.handleSubmit((values) => canjearMutation.mutate(values))}
              className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3"
              noValidate
            >
              {canjearMutation.isError && (
                <Alert
                  tipo="error"
                  mensaje={mensajeError(canjearMutation.error, 'No se pudo canjear')}
                />
              )}
              <Input
                label={`Puntos a canjear (máx. ${saldo})`}
                type="number"
                error={form.formState.errors.puntos?.message}
                {...form.register('puntos', {
                  valueAsNumber: true,
                  required: 'Indica cuántos puntos',
                  min: { value: 1, message: 'Debe ser al menos 1' },
                  max: { value: saldo, message: `No puede superar ${saldo}` },
                })}
              />
              <Input
                label="Motivo (opcional)"
                placeholder="Ej. descuento aplicado en la venta B002-00000123"
                {...form.register('observacion')}
              />
              <FormActions
                enviar="Confirmar canje"
                enviandoTexto="Canjeando…"
                onCancelar={() => setFormCanjeAbierto(false)}
                enviando={form.formState.isSubmitting || canjearMutation.isPending}
              />
            </form>
          )}

          <Table
            columnas={[
              { encabezado: 'Fecha', render: (m) => formatearFechaHora(m.creadoEn) },
              {
                encabezado: 'Tipo',
                render: (m) => <Badge tono={TONO_TIPO[m.tipo]}>{ETIQUETA_TIPO[m.tipo]}</Badge>,
              },
              {
                encabezado: 'Puntos',
                render: (m) => (
                  <span className={m.puntos >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                    {m.puntos >= 0 ? '+' : ''}
                    {m.puntos}
                  </span>
                ),
              },
              {
                encabezado: 'Detalle',
                render: (m) =>
                  m.venta
                    ? `Venta ${m.venta.serie}-${String(m.venta.numero).padStart(8, '0')}`
                    : (m.observacion ?? '—'),
              },
              {
                encabezado: 'Registrado por',
                render: (m) => (m.usuario ? nombrePersonal(m.usuario.personal) : 'Automático'),
              },
            ]}
            filas={detalleQuery.data.movimientos}
            claveFila={(m) => m.id}
            vacio="Sin movimientos todavía"
          />
        </div>
      )}
    </Modal>
  );
}

export function Fidelizacion() {
  const { tienePermiso } = useAuth();
  const [clienteViendo, setClienteViendo] = useState<string | null>(null);
  const [modalAjustar, setModalAjustar] = useState(false);

  const puedeGestionar = tienePermiso('fidelizacion.gestionar');

  const configuracionQuery = useQuery({
    queryKey: ['configuracion'],
    queryFn: configuracionService.obtenerConfiguracion,
    staleTime: 10 * 60 * 1000,
  });
  const clientesQuery = useQuery({
    queryKey: ['fidelizacion-clientes'],
    queryFn: fidelizacionService.listarClientesConPuntos,
  });

  const configuracion = configuracionQuery.data;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Fidelización</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Puntos que ganan los clientes identificados en cada venta
          </p>
        </div>
        {puedeGestionar && (
          <Button icono={<Plus className="h-4 w-4" />} onClick={() => setModalAjustar(true)}>
            Ajustar puntos
          </Button>
        )}
      </div>

      {configuracion && !configuracion.fidelizacionActiva && (
        <div className="mb-5">
          <Alert
            tipo="advertencia"
            mensaje="El programa está apagado: las ventas no acumulan puntos aunque tengan cliente. Actívalo en Configuración."
          />
        </div>
      )}

      {configuracion?.fidelizacionActiva && (
        <div className="animar-entrada mb-6 flex flex-wrap gap-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            <span>1 punto cada {formatearPrecio(configuracion.solesPorPunto)} de compra</span>
          </div>
          <div className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            <span>Cada punto vale {formatearPrecio(configuracion.valorCanjePunto)} al canjear</span>
          </div>
        </div>
      )}

      <Table
        columnas={[
          { encabezado: 'Cliente', render: (s) => nombreCliente(s.cliente) },
          {
            encabezado: 'Documento',
            render: (s) =>
              s.cliente.tipoDocumentoIdentidad
                ? `${s.cliente.tipoDocumentoIdentidad.nombre}: ${s.cliente.numeroDocumento}`
                : '—',
          },
          {
            encabezado: 'Saldo',
            render: (s) => <span className="font-semibold text-zinc-900">{s.saldo} pts</span>,
          },
          {
            encabezado: '',
            render: (s) => (
              <button
                type="button"
                onClick={() => setClienteViendo(s.cliente.id)}
                className="text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
              >
                Ver movimientos
              </button>
            ),
          },
        ]}
        filas={clientesQuery.data ?? []}
        claveFila={(s) => s.cliente.id}
        vacio="Todavía nadie tiene puntos"
        cargando={clientesQuery.isLoading}
        error={
          clientesQuery.isError
            ? mensajeError(clientesQuery.error, 'No se pudo cargar la fidelización')
            : undefined
        }
        onReintentar={() => void clientesQuery.refetch()}
      />

      <ClienteDetalleModal
        clienteId={clienteViendo}
        puedeGestionar={puedeGestionar}
        onCerrar={() => setClienteViendo(null)}
      />
      <AjustarPuntosModal abierto={modalAjustar} onCerrar={() => setModalAjustar(false)} />
    </div>
  );
}
