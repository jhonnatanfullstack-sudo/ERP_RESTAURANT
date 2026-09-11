import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  HandCoins,
  Landmark,
  Receipt,
  Undo2,
  Wallet,
} from 'lucide-react';
import * as cobranzasService from '../services/cobranzas.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { FormActions } from '../components/ui/FormActions';
import { SeccionFormulario } from '../components/ui/SeccionFormulario';
import { EmptyState } from '../components/ui/EmptyState';
import {
  formatearFechaHora,
  formatearPrecio,
  nombreCliente,
  nombrePersonal,
  numeroComprobante,
} from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type { RegistrarPagoInput } from '../services/cobranzas.service';
import type { Cobranza, EstadoCobranza } from '../types/api';

const ETIQUETA_ESTADO: Record<EstadoCobranza, string> = {
  pendiente: 'Pendiente',
  parcial: 'Pago parcial',
  pagada: 'Cancelada',
  vencida: 'Vencida',
};

const TONO_ESTADO: Record<EstadoCobranza, 'exito' | 'neutral' | 'peligro'> = {
  pendiente: 'neutral',
  parcial: 'neutral',
  pagada: 'exito',
  vencida: 'peligro',
};

/** Fecha `YYYY-MM-DD` de hoy en hora local — la misma con la que el backend compara los
 * vencimientos (`cobranza.service.ts: hoyIso`). */
function hoyIso(): string {
  const ahora = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
}

function formatearFecha(iso: string | null): string {
  if (!iso) return '—';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

interface ValoresPago extends Omit<RegistrarPagoInput, 'monto'> {
  monto: number | string;
}

/** Ficha del documento: cronograma pactado + cobros ya registrados. Es lo que un contador
 * necesita ver de un tirón para sustentar la cuenta por cobrar. */
function DetalleCobranza({
  cobranza,
  puedeAnular,
  onAnular,
}: {
  cobranza: Cobranza;
  puedeAnular: boolean;
  onAnular: (pagoId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Total del comprobante</p>
          <p className="font-semibold text-zinc-900">{formatearPrecio(cobranza.total)}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs text-emerald-700">Cobrado</p>
          <p className="font-semibold text-emerald-800">{formatearPrecio(cobranza.pagado)}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
          <p className="text-xs text-orange-700">Saldo pendiente</p>
          <p className="font-semibold text-orange-800">{formatearPrecio(cobranza.saldo)}</p>
        </div>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <CalendarClock className="h-4 w-4 text-zinc-400" />
          Cronograma pactado
        </h4>
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-xs tracking-wide text-zinc-500 uppercase">
                <th className="px-3 py-2 font-semibold">Cuota</th>
                <th className="px-3 py-2 font-semibold">Vencimiento</th>
                <th className="px-3 py-2 text-right font-semibold">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {cobranza.cuotas.map((cuota) => {
                const vencida = cuota.fechaVencimiento < hoyIso() && cobranza.saldo > 0;
                return (
                  <tr key={cuota.id}>
                    <td className="px-3 py-2 text-zinc-700">
                      {String(cuota.numero).padStart(3, '0')}
                    </td>
                    <td className={`px-3 py-2 ${vencida ? 'text-red-600' : 'text-zinc-700'}`}>
                      {formatearFecha(cuota.fechaVencimiento)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-zinc-900">
                      {formatearPrecio(cuota.monto)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <HandCoins className="h-4 w-4 text-zinc-400" />
          Pagos registrados
        </h4>
        {cobranza.pagos.length === 0 ? (
          <EmptyState icono={Wallet} titulo="Todavía no se registró ningún cobro" />
        ) : (
          <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
            {cobranza.pagos.map((pago) => (
              <li
                key={pago.id}
                className={`flex items-start gap-3 px-3 py-2.5 ${pago.anulado ? 'bg-zinc-50' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <span className={pago.anulado ? 'text-zinc-400 line-through' : ''}>
                      {formatearPrecio(pago.monto)}
                    </span>
                    <span className="text-xs font-normal text-zinc-500">
                      {formatearFecha(pago.fechaPago)} · {pago.medioPago.nombre}
                    </span>
                    {pago.anulado && <Badge tono="peligro">Anulado</Badge>}
                  </p>
                  {/* El sustento bancario es lo que respalda el cobro ante SUNAT: si existe,
                      se muestra siempre, no escondido tras un botón. */}
                  {pago.banco && (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-600">
                      <Landmark className="h-3 w-3 shrink-0 text-zinc-400" />
                      {pago.banco.nombre}
                      {pago.numeroOperacion && (
                        <span className="font-mono text-zinc-500">
                          · Op. {pago.numeroOperacion}
                        </span>
                      )}
                    </p>
                  )}
                  {pago.observacion && (
                    <p className="mt-0.5 text-xs text-zinc-500">{pago.observacion}</p>
                  )}
                  {pago.anulado && pago.motivoAnulacion && (
                    <p className="mt-0.5 text-xs text-red-600">
                      Motivo de anulación: {pago.motivoAnulacion}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Registrado por {nombrePersonal(pago.usuario.personal)} ·{' '}
                    {formatearFechaHora(pago.creadoEn)}
                  </p>
                </div>
                {puedeAnular && !pago.anulado && (
                  <button
                    type="button"
                    onClick={() => onAnular(pago.id)}
                    className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Anular
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CuentasPorCobrar() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [cobrando, setCobrando] = useState<Cobranza | null>(null);
  const [viendo, setViendo] = useState<Cobranza | null>(null);
  const [pagoAnulando, setPagoAnulando] = useState<string | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  const cobranzasQuery = useQuery({
    queryKey: ['cuentas-por-cobrar', soloPendientes],
    queryFn: () => cobranzasService.listarCuentasPorCobrar(soloPendientes),
  });
  const mediosPagoQuery = useQuery({
    queryKey: ['medios-pago'],
    queryFn: catalogosService.listarMediosPago,
  });
  const bancosQuery = useQuery({ queryKey: ['bancos'], queryFn: catalogosService.listarBancos });

  const pagoForm = useForm<ValoresPago>({
    defaultValues: { fechaPago: hoyIso(), monto: '', medioPagoId: '' },
  });
  const medioPagoId = useWatch({ control: pagoForm.control, name: 'medioPagoId' });
  const medioSeleccionado = (mediosPagoQuery.data ?? []).find((m) => m.id === medioPagoId);
  // Qué medios exigen banco lo dice el catálogo (`requiereBanco`), no una lista de códigos
  // en el frontend: agregar un medio bancarizado nuevo no obliga a tocar esta pantalla.
  const exigeBanco = medioSeleccionado?.requiereBanco ?? false;

  // `?? []` dentro del useMemo y no fuera: un array nuevo en cada render invalidaría el memo
  // siempre (react-hooks/exhaustive-deps lo advierte).
  const cobranzas = useMemo(() => cobranzasQuery.data ?? [], [cobranzasQuery.data]);
  const totales = useMemo(
    () =>
      cobranzas.reduce(
        (acumulado, cobranza) => ({
          saldo: acumulado.saldo + cobranza.saldo,
          vencido: acumulado.vencido + (cobranza.estadoCobranza === 'vencida' ? cobranza.saldo : 0),
          documentos: acumulado.documentos + (cobranza.saldo > 0 ? 1 : 0),
        }),
        { saldo: 0, vencido: 0, documentos: 0 },
      ),
    [cobranzas],
  );

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['cuentas-por-cobrar'] });
    queryClient.invalidateQueries({ queryKey: ['ventas'] });
    queryClient.invalidateQueries({ queryKey: ['cajas'] });
  }

  const pagarMutation = useMutation({
    mutationFn: (valores: ValoresPago) =>
      cobranzasService.registrarPago(cobrando!.venta.id, {
        ...valores,
        monto: Number(valores.monto),
        bancoId: exigeBanco ? valores.bancoId : undefined,
        numeroOperacion: exigeBanco ? valores.numeroOperacion : undefined,
        observacion: valores.observacion || undefined,
      }),
    onSuccess: (cobranza) => {
      invalidar();
      // Deja la ficha abierta con el saldo ya actualizado: es lo que el cajero quiere ver
      // inmediatamente después de cobrar.
      setViendo(cobranza);
      cerrarCobro();
    },
  });

  const anularMutation = useMutation({
    mutationFn: () => cobranzasService.anularPago(pagoAnulando!, motivoAnulacion.trim()),
    onSuccess: (cobranza) => {
      invalidar();
      setViendo(cobranza);
      setPagoAnulando(null);
      setMotivoAnulacion('');
    },
  });

  function abrirCobro(cobranza: Cobranza) {
    setCobrando(cobranza);
    pagoForm.reset({
      fechaPago: hoyIso(),
      // Propone cancelar el saldo completo, que es el caso habitual; el cajero puede bajarlo
      // si el cliente abona a cuenta.
      monto: cobranza.saldo,
      medioPagoId: '',
    });
    pagarMutation.reset();
  }

  function cerrarCobro() {
    setCobrando(null);
    pagarMutation.reset();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Cuentas por cobrar</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Documentos emitidos al crédito, su cronograma de cuotas y los cobros recibidos
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Receipt className="h-3.5 w-3.5" />
            Documentos pendientes
          </p>
          <p className="mt-1 text-xl font-bold text-zinc-900">{totales.documentos}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Banknote className="h-3.5 w-3.5" />
            Saldo por cobrar
          </p>
          <p className="mt-1 text-xl font-bold text-zinc-900">{formatearPrecio(totales.saldo)}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Vencido
          </p>
          <p className="mt-1 text-xl font-bold text-red-700">{formatearPrecio(totales.vencido)}</p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { valor: true, etiqueta: 'Con saldo pendiente' },
          { valor: false, etiqueta: 'Todos' },
        ].map((opcion) => (
          <button
            key={String(opcion.valor)}
            type="button"
            onClick={() => setSoloPendientes(opcion.valor)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              soloPendientes === opcion.valor
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Comprobante',
            render: (c) => (
              <button
                type="button"
                onClick={() => setViendo(c)}
                className="font-medium text-orange-600 hover:text-orange-700 hover:underline"
              >
                {c.venta.tipoComprobante.nombre} {numeroComprobante(c.venta.serie, c.venta.numero)}
              </button>
            ),
          },
          { encabezado: 'Cliente', render: (c) => nombreCliente(c.venta.cliente) },
          { encabezado: 'Emisión', render: (c) => formatearFechaHora(c.venta.creadoEn) },
          {
            encabezado: 'Vencimiento',
            render: (c) => (
              <span className={c.diasVencido > 0 ? 'font-medium text-red-600' : 'text-zinc-700'}>
                {formatearFecha(c.proximoVencimiento)}
                {c.diasVencido > 0 && <span className="ml-1 text-xs">({c.diasVencido} d)</span>}
              </span>
            ),
          },
          { encabezado: 'Total', render: (c) => formatearPrecio(c.total) },
          { encabezado: 'Cobrado', render: (c) => formatearPrecio(c.pagado) },
          {
            encabezado: 'Saldo',
            render: (c) => (
              <span className="font-semibold text-zinc-900">{formatearPrecio(c.saldo)}</span>
            ),
          },
          {
            encabezado: 'Estado',
            render: (c) => (
              <Badge tono={TONO_ESTADO[c.estadoCobranza]}>
                {ETIQUETA_ESTADO[c.estadoCobranza]}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (c) => (
              <div className="flex items-center gap-3">
                {tienePermiso('cobranzas.registrar') && c.saldo > 0 && (
                  <button
                    type="button"
                    onClick={() => abrirCobro(c)}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <HandCoins className="h-3.5 w-3.5" />
                    Registrar pago
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViendo(c)}
                  className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
                >
                  Ver
                </button>
              </div>
            ),
          },
        ]}
        filas={cobranzas}
        claveFila={(c) => c.venta.id}
        vacio="No hay ventas al crédito"
        vacioDescripcion='Las ventas registradas con forma de pago "Crédito" aparecen aquí para su cobranza.'
        cargando={cobranzasQuery.isLoading}
        error={
          cobranzasQuery.isError
            ? mensajeError(cobranzasQuery.error, 'No se pudieron cargar las cuentas por cobrar')
            : undefined
        }
        onReintentar={() => void cobranzasQuery.refetch()}
      />

      <Modal
        abierto={cobrando !== null}
        titulo={
          cobrando
            ? `Cobrar ${cobrando.venta.tipoComprobante.nombre} ${numeroComprobante(cobrando.venta.serie, cobrando.venta.numero)}`
            : ''
        }
        descripcion={
          cobrando
            ? `${nombreCliente(cobrando.venta.cliente)} · saldo ${formatearPrecio(cobrando.saldo)}`
            : ''
        }
        onCerrar={cerrarCobro}
        tamano="lg"
      >
        {cobrando && (
          <form
            onSubmit={pagoForm.handleSubmit((valores) => pagarMutation.mutate(valores))}
            className="flex flex-col gap-4"
            noValidate
          >
            {pagarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(pagarMutation.error, 'No se pudo registrar el pago')}
              />
            )}

            <SeccionFormulario titulo="Cobro" icono={HandCoins}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Fecha del pago"
                  type="date"
                  error={pagoForm.formState.errors.fechaPago?.message}
                  {...pagoForm.register('fechaPago', { required: 'Indica la fecha del pago' })}
                />
                <Input
                  label="Monto"
                  type="number"
                  step="0.01"
                  min="0.01"
                  ayuda={`Máximo ${formatearPrecio(cobrando.saldo)}.`}
                  error={pagoForm.formState.errors.monto?.message}
                  {...pagoForm.register('monto', {
                    required: 'Indica el monto cobrado',
                    validate: (valor) => {
                      const numero = Number(valor);
                      if (!(numero > 0)) return 'El monto debe ser mayor a 0';
                      if (numero > cobrando.saldo) return 'El monto excede el saldo pendiente';
                      return true;
                    },
                  })}
                />
              </div>

              <Select
                label="Medio de pago"
                error={pagoForm.formState.errors.medioPagoId?.message}
                {...pagoForm.register('medioPagoId', { required: 'Selecciona el medio de pago' })}
              >
                <option value="">Seleccionar…</option>
                {(mediosPagoQuery.data ?? []).map((medio) => (
                  <option key={medio.id} value={medio.id}>
                    {medio.nombre}
                  </option>
                ))}
              </Select>
            </SeccionFormulario>

            {/* Solo aparece si el medio elegido pasa por el sistema financiero: en efectivo
                no hay banco que consignar, y pedirlo sería ruido. */}
            {exigeBanco && (
              <SeccionFormulario
                titulo="Sustento bancario"
                descripcion="Obligatorio por la Ley 28194 (bancarización) para respaldar el cobro ante SUNAT."
                icono={Landmark}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Select
                    label="Banco"
                    error={pagoForm.formState.errors.bancoId?.message}
                    {...pagoForm.register('bancoId', {
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
                    label="Número de operación"
                    placeholder="Ej. 00123456"
                    error={pagoForm.formState.errors.numeroOperacion?.message}
                    {...pagoForm.register('numeroOperacion', {
                      required: exigeBanco ? 'Indica el número de operación' : false,
                    })}
                  />
                </div>
              </SeccionFormulario>
            )}

            <Input label="Observación" ayuda="Opcional." {...pagoForm.register('observacion')} />

            <FormActions
              enviar="Registrar pago"
              enviandoTexto="Registrando…"
              onCancelar={cerrarCobro}
              enviando={pagarMutation.isPending}
            />
          </form>
        )}
      </Modal>

      <Modal
        abierto={viendo !== null}
        titulo={
          viendo
            ? `${viendo.venta.tipoComprobante.nombre} ${numeroComprobante(viendo.venta.serie, viendo.venta.numero)}`
            : ''
        }
        descripcion={viendo ? nombreCliente(viendo.venta.cliente) : ''}
        onCerrar={() => setViendo(null)}
        tamano="lg"
      >
        {viendo && (
          <DetalleCobranza
            cobranza={viendo}
            puedeAnular={tienePermiso('cobranzas.anular')}
            onAnular={(pagoId) => {
              setPagoAnulando(pagoId);
              setMotivoAnulacion('');
              anularMutation.reset();
            }}
          />
        )}
      </Modal>

      <Modal
        abierto={pagoAnulando !== null}
        titulo="Anular pago"
        descripcion="El pago se conserva marcado como anulado y el saldo vuelve a subir."
        onCerrar={() => setPagoAnulando(null)}
      >
        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            if (motivoAnulacion.trim()) anularMutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          {anularMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(anularMutation.error, 'No se pudo anular el pago')}
            />
          )}

          <Input
            label="Motivo de la anulación"
            placeholder="Ej. Se registró con el monto equivocado"
            value={motivoAnulacion}
            onChange={(evento) => setMotivoAnulacion(evento.target.value)}
            error={
              motivoAnulacion.trim() === '' && anularMutation.isError
                ? 'Indica el motivo'
                : undefined
            }
          />

          <FormActions
            enviar="Anular pago"
            enviandoTexto="Anulando…"
            variante="danger"
            onCancelar={() => setPagoAnulando(null)}
            enviando={anularMutation.isPending}
          />
        </form>
      </Modal>
    </div>
  );
}
