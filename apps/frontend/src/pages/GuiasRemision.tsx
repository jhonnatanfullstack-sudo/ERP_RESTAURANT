import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Eye, PackageCheck, Plus, RefreshCw, Send, Trash2, Truck, User } from 'lucide-react';
import * as guiasRemisionService from '../services/guias-remision.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { FormActions } from '../components/ui/FormActions';
import { EmptyState } from '../components/ui/EmptyState';
import { TarjetaOpcion } from '../components/ui/TarjetaOpcion';
import { formatearFechaHora } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import { vacioAIndefinido } from '../utils/formulario';
import type { CrearGuiaRemisionInput } from '../services/guias-remision.service';
import type { EstadoComprobante, GuiaRemision } from '../types/api';

const MAXIMO_LINEAS = 50;

const ETIQUETA_ESTADO: Record<EstadoComprobante, string> = {
  pendiente: 'Pendiente',
  aceptado: 'Aceptado por SUNAT',
  observado: 'Aceptado con observaciones',
  rechazado: 'Rechazado',
  error_envio: 'No se pudo enviar',
};

const TONO_ESTADO: Record<EstadoComprobante, 'exito' | 'neutral' | 'peligro'> = {
  pendiente: 'neutral',
  aceptado: 'exito',
  observado: 'neutral',
  rechazado: 'peligro',
  error_envio: 'peligro',
};

const CODIGO_MODALIDAD_PRIVADO = '02';

function GuiaDetalleModal({ guia, onCerrar }: { guia: GuiaRemision | null; onCerrar: () => void }) {
  return (
    <Modal
      abierto={guia !== null}
      titulo={guia ? `Guía ${guia.serie}-${String(guia.numero).padStart(8, '0')}` : ''}
      onCerrar={onCerrar}
    >
      {guia && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-zinc-500">Fecha de traslado</p>
              <p className="font-medium text-zinc-900">{guia.fechaTraslado}</p>
            </div>
            <Badge tono={TONO_ESTADO[guia.estado]}>{ETIQUETA_ESTADO[guia.estado]}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div>
              <p className="text-zinc-500">Motivo</p>
              <p className="font-medium text-zinc-900">{guia.motivoTraslado.nombre}</p>
            </div>
            <div>
              <p className="text-zinc-500">Modalidad</p>
              <p className="font-medium text-zinc-900">{guia.modalidadTraslado.nombre}</p>
            </div>
            <div>
              <p className="text-zinc-500">Punto de partida</p>
              <p className="font-medium text-zinc-900">{guia.partidaDireccion}</p>
            </div>
            <div>
              <p className="text-zinc-500">Punto de llegada</p>
              <p className="font-medium text-zinc-900">{guia.llegadaDireccion}</p>
            </div>
            <div>
              <p className="text-zinc-500">Peso total</p>
              <p className="font-medium text-zinc-900">{guia.pesoTotalKg} kg</p>
            </div>
            {guia.numeroBultos != null && (
              <div>
                <p className="text-zinc-500">Bultos</p>
                <p className="font-medium text-zinc-900">{guia.numeroBultos}</p>
              </div>
            )}
            {guia.modalidadTraslado.codigo === CODIGO_MODALIDAD_PRIVADO ? (
              <div>
                <p className="text-zinc-500">Vehículo</p>
                <p className="font-medium text-zinc-900">
                  {guia.transportistaPlaca} · Lic. {guia.transportistaLicencia}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-zinc-500">Transportista</p>
                <p className="font-medium text-zinc-900">
                  {guia.transportistaRazonSocial} · RUC {guia.transportistaRuc}
                </p>
              </div>
            )}
            {guia.observacion && (
              <div className="col-span-2">
                <p className="text-zinc-500">Observación</p>
                <p className="font-medium text-zinc-900">{guia.observacion}</p>
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
                    Cantidad
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {guia.detalles.map((detalle) => (
                  <tr key={detalle.id}>
                    <td className="px-3 py-2 text-zinc-900">{detalle.descripcion}</td>
                    <td className="px-3 py-2 text-zinc-700">
                      {detalle.cantidad} {detalle.unidadMedida.nombre}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {guia.mensajeRespuesta && guia.estado !== 'aceptado' && (
            <p className="text-xs text-zinc-600">{guia.mensajeRespuesta}</p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function GuiasRemision() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [guiaViendo, setGuiaViendo] = useState<GuiaRemision | null>(null);
  const [lineaStaging, setLineaStaging] = useState({ descripcion: '', cantidad: 1, unidadMedidaId: '' });
  const [errorCarrito, setErrorCarrito] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  const guiasQuery = useQuery({
    queryKey: ['guias-remision'],
    queryFn: guiasRemisionService.listarGuiasRemision,
  });
  const motivosQuery = useQuery({
    queryKey: ['motivos-traslado'],
    queryFn: catalogosService.listarMotivosTraslado,
  });
  const modalidadesQuery = useQuery({
    queryKey: ['modalidades-traslado'],
    queryFn: catalogosService.listarModalidadesTraslado,
  });
  const unidadesQuery = useQuery({
    queryKey: ['unidades-medida'],
    queryFn: catalogosService.listarUnidadesMedida,
  });

  const crearForm = useForm<CrearGuiaRemisionInput>({
    defaultValues: { detalles: [], pesoTotalKg: 0 },
  });
  const carrito = useFieldArray({ control: crearForm.control, name: 'detalles' });
  const modalidadId = useWatch({ control: crearForm.control, name: 'modalidadTrasladoId' });
  const modalidadElegida = modalidadesQuery.data?.find((m) => m.id === modalidadId);
  const esPrivado = modalidadElegida?.codigo === CODIGO_MODALIDAD_PRIVADO;

  const crearMutation = useMutation({
    mutationFn: guiasRemisionService.crearGuiaRemision,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guias-remision'] });
      cerrarFormulario();
    },
  });

  const emitirMutation = useMutation({
    mutationFn: guiasRemisionService.emitirGuiaRemision,
    onSuccess: () => {
      setErrorAccion(null);
      queryClient.invalidateQueries({ queryKey: ['guias-remision'] });
    },
    onError: (excepcion) => setErrorAccion(mensajeError(excepcion, 'No se pudo emitir la guía')),
  });

  const reintentarMutation = useMutation({
    mutationFn: guiasRemisionService.reintentarEnvioGuiaRemision,
    onSuccess: () => {
      setErrorAccion(null);
      queryClient.invalidateQueries({ queryKey: ['guias-remision'] });
    },
    onError: (excepcion) => setErrorAccion(mensajeError(excepcion, 'No se pudo reintentar el envío')),
  });

  function cerrarFormulario() {
    setModalAbierto(false);
    crearForm.reset({ detalles: [], pesoTotalKg: 0 });
    crearMutation.reset();
    setLineaStaging({ descripcion: '', cantidad: 1, unidadMedidaId: '' });
    setErrorCarrito(null);
  }

  function agregarLinea() {
    if (!lineaStaging.descripcion.trim() || !lineaStaging.unidadMedidaId) return;
    if (carrito.fields.length >= MAXIMO_LINEAS) return;
    carrito.append({ ...lineaStaging, descripcion: lineaStaging.descripcion.trim() });
    setLineaStaging({ descripcion: '', cantidad: 1, unidadMedidaId: '' });
    setErrorCarrito(null);
  }

  function alEnviar(values: CrearGuiaRemisionInput) {
    if (!values.detalles || values.detalles.length === 0) {
      setErrorCarrito('Agrega al menos un ítem antes de registrar la guía');
      return;
    }
    const payload: CrearGuiaRemisionInput = {
      ...values,
      partidaUbigeo: vacioAIndefinido(values.partidaUbigeo),
      llegadaUbigeo: vacioAIndefinido(values.llegadaUbigeo),
      destinatarioNumeroDocumento: vacioAIndefinido(values.destinatarioNumeroDocumento),
      destinatarioNombre: vacioAIndefinido(values.destinatarioNombre),
      observacion: vacioAIndefinido(values.observacion),
      transportistaPlaca: esPrivado ? values.transportistaPlaca : undefined,
      transportistaLicencia: esPrivado ? values.transportistaLicencia : undefined,
      transportistaRuc: esPrivado ? undefined : values.transportistaRuc,
      transportistaRazonSocial: esPrivado ? undefined : values.transportistaRazonSocial,
    };
    crearMutation.mutate(payload);
  }

  const guias = guiasQuery.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Guías de remisión</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Guía de Remisión Electrónica (GRE) para trasladar insumos y mercadería — obligatoria
            ante SUNAT desde julio de 2026
          </p>
        </div>
        {tienePermiso('guias_remision.crear') && (
          <Button
            icono={<PackageCheck className="h-4 w-4" />}
            onClick={() => {
              crearForm.reset({ detalles: [], pesoTotalKg: 0 });
              setModalAbierto(true);
            }}
          >
            Nueva guía
          </Button>
        )}
      </div>

      {errorAccion && <Alert tipo="error" mensaje={errorAccion} />}

      <Table
        columnas={[
          {
            encabezado: 'Guía',
            render: (g) => (
              <button
                type="button"
                onClick={() => setGuiaViendo(g)}
                className="font-medium text-orange-600 hover:text-orange-700 hover:underline"
              >
                {g.serie}-{String(g.numero).padStart(8, '0')}
              </button>
            ),
          },
          { encabezado: 'Motivo', render: (g) => g.motivoTraslado.nombre },
          { encabezado: 'Traslado', render: (g) => g.fechaTraslado },
          { encabezado: 'Registrada', render: (g) => formatearFechaHora(g.creadoEn) },
          {
            encabezado: 'Estado SUNAT',
            render: (g) => <Badge tono={TONO_ESTADO[g.estado]}>{ETIQUETA_ESTADO[g.estado]}</Badge>,
          },
          {
            encabezado: '',
            render: (g) => (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setGuiaViendo(g)}
                  className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver
                </button>
                {tienePermiso('guias_remision.emitir') && g.estado === 'pendiente' && !g.xmlFirmado && (
                  <button
                    type="button"
                    disabled={emitirMutation.isPending}
                    onClick={() => emitirMutation.mutate(g.id)}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Emitir
                  </button>
                )}
                {tienePermiso('guias_remision.emitir') && g.estado === 'error_envio' && (
                  <button
                    type="button"
                    disabled={reintentarMutation.isPending}
                    onClick={() => reintentarMutation.mutate(g.id)}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reintentar
                  </button>
                )}
              </div>
            ),
          },
        ]}
        filas={guias}
        claveFila={(g) => g.id}
        vacio="No hay guías de remisión registradas"
        cargando={guiasQuery.isLoading}
        error={
          guiasQuery.isError
            ? mensajeError(guiasQuery.error, 'No se pudieron cargar las guías de remisión')
            : undefined
        }
        onReintentar={() => void guiasQuery.refetch()}
      />

      <Modal
        abierto={modalAbierto}
        titulo="Nueva guía de remisión"
        descripcion="Registra el traslado — se numera con tu talonario de serie T y se firma recién al emitir."
        onCerrar={cerrarFormulario}
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
              mensaje={mensajeError(crearMutation.error, 'No se pudo registrar la guía')}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Motivo de traslado" {...crearForm.register('motivoTrasladoId', { required: true })}>
              <option value="">Selecciona un motivo</option>
              {motivosQuery.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </Select>
            <Input
              label="Fecha de traslado"
              type="date"
              {...crearForm.register('fechaTraslado', { required: true })}
            />
          </div>

          <Controller
            control={crearForm.control}
            name="modalidadTrasladoId"
            rules={{ required: true }}
            render={({ field }) => (
              <div>
                <p className="mb-2 text-sm font-medium text-zinc-700">Modalidad de traslado</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {modalidadesQuery.data?.map((m) => (
                    <TarjetaOpcion
                      key={m.id}
                      activo={field.value === m.id}
                      icono={m.codigo === CODIGO_MODALIDAD_PRIVADO ? Truck : User}
                      titulo={m.nombre}
                      descripcion={
                        m.codigo === CODIGO_MODALIDAD_PRIVADO
                          ? 'Vehículo propio del restaurante'
                          : 'Empresa de transporte contratada'
                      }
                      onClick={() => field.onChange(m.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          />

          {esPrivado ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Placa del vehículo" placeholder="ABC-123" {...crearForm.register('transportistaPlaca')} />
              <Input label="Licencia del conductor" {...crearForm.register('transportistaLicencia')} />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="RUC del transportista" {...crearForm.register('transportistaRuc')} />
              <Input
                label="Razón social del transportista"
                {...crearForm.register('transportistaRazonSocial')}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Punto de partida" {...crearForm.register('partidaDireccion', { required: true })} />
            <Input label="Punto de llegada" {...crearForm.register('llegadaDireccion', { required: true })} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Peso total (kg)"
              type="number"
              min="0.01"
              step="0.01"
              {...crearForm.register('pesoTotalKg', { required: true, valueAsNumber: true })}
            />
            <Input
              label="N° de bultos"
              type="number"
              min="1"
              ayuda="Opcional"
              {...crearForm.register('numeroBultos', { valueAsNumber: true })}
            />
            <Input
              label="Destinatario (opcional)"
              ayuda="Vacío si es entre tus propios locales"
              {...crearForm.register('destinatarioNombre')}
            />
          </div>

          <Input label="Observación" ayuda="Opcional." {...crearForm.register('observacion')} />

          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4">
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              Ítems a trasladar
            </p>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_90px_140px_auto]">
              <FormField id="guia-item" label="Descripción">
                <input
                  id="guia-item"
                  type="text"
                  value={lineaStaging.descripcion}
                  onChange={(e) => setLineaStaging((s) => ({ ...s, descripcion: e.target.value }))}
                  placeholder="Ej. Papa blanca"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                />
              </FormField>
              <Input
                label="Cantidad"
                type="number"
                min="0.01"
                step="0.01"
                value={lineaStaging.cantidad}
                onChange={(e) => setLineaStaging((s) => ({ ...s, cantidad: Number(e.target.value) }))}
              />
              <Select
                label="Unidad"
                value={lineaStaging.unidadMedidaId}
                onChange={(e) => setLineaStaging((s) => ({ ...s, unidadMedidaId: e.target.value }))}
              >
                <option value="">Selecciona</option>
                {unidadesQuery.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                icono={<Plus className="h-4 w-4" />}
                onClick={agregarLinea}
                disabled={!lineaStaging.descripcion.trim() || !lineaStaging.unidadMedidaId}
              >
                Agregar
              </Button>
            </div>

            {carrito.fields.length === 0 ? (
              <EmptyState icono={PackageCheck} titulo="Aún no agregaste ítems" />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                      <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                        Descripción
                      </th>
                      <th className="px-3 py-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                        Cantidad
                      </th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {carrito.fields.map((linea, indice) => {
                      const unidad = unidadesQuery.data?.find((u) => u.id === linea.unidadMedidaId);
                      return (
                        <tr key={linea.id}>
                          <td className="px-3 py-2 text-sm font-medium text-zinc-900">
                            {linea.descripcion}
                          </td>
                          <td className="px-3 py-2 text-zinc-700">
                            {linea.cantidad} {unidad?.nombre}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => carrito.remove(indice)}
                              aria-label={`Quitar ${linea.descripcion}`}
                              className="text-zinc-400 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {errorCarrito && <p className="text-xs font-medium text-red-600">{errorCarrito}</p>}
          </div>

          <FormActions
            enviar="Registrar guía"
            enviandoTexto="Registrando…"
            onCancelar={cerrarFormulario}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <GuiaDetalleModal guia={guiaViendo} onCerrar={() => setGuiaViendo(null)} />
    </div>
  );
}
