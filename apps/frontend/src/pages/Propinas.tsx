import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { Coins, HandCoins, Scale, Timer, Users } from 'lucide-react';
import * as propinasService from '../services/propinas.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Panel } from '../components/ui/Panel';
import { TarjetaOpcion } from '../components/ui/TarjetaOpcion';
import { formatearFechaHora, formatearPrecio, nombrePersonal } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type { RangoRepartoInput } from '../services/propinas.service';
import type { MetodoRepartoPropina, RepartoPropina, VistaPreviaRepartoPropina } from '../types/api';

const ETIQUETA_METODO: Record<MetodoRepartoPropina, string> = {
  igualitario: 'Igualitario',
  por_horas: 'Por horas trabajadas',
};

function RepartoDetalleModal({
  reparto,
  onCerrar,
}: {
  reparto: RepartoPropina | null;
  onCerrar: () => void;
}) {
  return (
    <Modal
      abierto={reparto !== null}
      titulo={reparto ? `Reparto del ${formatearFechaHora(reparto.fechaDesde)}` : ''}
      onCerrar={onCerrar}
    >
      {reparto && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div>
              <p className="text-zinc-500">Período</p>
              <p className="font-medium text-zinc-900">
                {formatearFechaHora(reparto.fechaDesde)} — {formatearFechaHora(reparto.fechaHasta)}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Método</p>
              <p className="font-medium text-zinc-900">{ETIQUETA_METODO[reparto.metodo]}</p>
            </div>
            <div>
              <p className="text-zinc-500">Total repartido</p>
              <p className="font-medium text-zinc-900">{formatearPrecio(reparto.totalPropinas)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Registrado por</p>
              <p className="font-medium text-zinc-900">
                {nombrePersonal(reparto.usuarioRegistro.personal)}
              </p>
            </div>
            {reparto.observacion && (
              <div className="col-span-2">
                <p className="text-zinc-500">Observación</p>
                <p className="text-zinc-700">{reparto.observacion}</p>
              </div>
            )}
          </div>

          <Table
            columnas={[
              { encabezado: 'Persona', render: (d) => nombrePersonal(d.usuario.personal) },
              {
                encabezado: 'Horas',
                render: (d) => (d.horasTrabajadas !== null ? d.horasTrabajadas.toFixed(2) : '—'),
              },
              { encabezado: 'Monto', render: (d) => formatearPrecio(d.monto) },
            ]}
            filas={reparto.detalles}
            claveFila={(d) => d.id}
            vacio="Sin participantes"
          />
        </div>
      )}
    </Modal>
  );
}

export function Propinas() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaRepartoPropina | null>(null);
  const [rangoConfirmado, setRangoConfirmado] = useState<RangoRepartoInput | null>(null);
  const [repartoViendo, setRepartoViendo] = useState<RepartoPropina | null>(null);

  const form = useForm<RangoRepartoInput & { observacion?: string }>({
    defaultValues: { metodo: 'igualitario' },
  });
  const metodoSeleccionado = useWatch({ control: form.control, name: 'metodo' });

  const historialQuery = useQuery({
    queryKey: ['repartos-propinas'],
    queryFn: propinasService.listarRepartos,
  });

  const vistaPreviaMutation = useMutation({
    mutationFn: (valores: RangoRepartoInput) => propinasService.vistaPreviaReparto(valores),
    onSuccess: (datos, valores) => {
      setVistaPrevia(datos);
      setRangoConfirmado(valores);
    },
  });

  const crearMutation = useMutation({
    mutationFn: (observacion: string | undefined) =>
      propinasService.crearReparto({ ...rangoConfirmado!, observacion }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repartos-propinas'] });
      setVistaPrevia(null);
      setRangoConfirmado(null);
      form.setValue('observacion', '');
    },
  });

  function alVerVistaPrevia(valores: RangoRepartoInput & { observacion?: string }) {
    setVistaPrevia(null);
    vistaPreviaMutation.mutate({
      fechaDesde: valores.fechaDesde,
      fechaHasta: valores.fechaHasta,
      metodo: valores.metodo,
    });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Reparto de propinas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Reparte las propinas recaudadas en un período entre quienes trabajaron ese período
        </p>
      </div>

      {tienePermiso('propinas.repartir') && (
        <Panel titulo="Nuevo reparto" icono={HandCoins} className="mb-8">
          <form
            onSubmit={form.handleSubmit(alVerVistaPrevia)}
            className="flex flex-col gap-4 p-4"
            noValidate
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Desde"
                type="datetime-local"
                error={form.formState.errors.fechaDesde?.message}
                {...form.register('fechaDesde', { required: 'Indica el inicio del período' })}
              />
              <Input
                label="Hasta"
                type="datetime-local"
                error={form.formState.errors.fechaHasta?.message}
                {...form.register('fechaHasta', { required: 'Indica el fin del período' })}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <TarjetaOpcion
                activo={metodoSeleccionado === 'igualitario'}
                icono={Scale}
                titulo="Igualitario"
                descripcion="Mismo monto para cada persona que trabajó el período."
                onClick={() => form.setValue('metodo', 'igualitario')}
              />
              <TarjetaOpcion
                activo={metodoSeleccionado === 'por_horas'}
                icono={Timer}
                titulo="Por horas"
                descripcion="Proporcional a las horas de turno cerradas en el período."
                onClick={() => form.setValue('metodo', 'por_horas')}
              />
            </div>

            {vistaPreviaMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(vistaPreviaMutation.error, 'No se pudo calcular el reparto')}
              />
            )}

            <Button type="submit" cargando={vistaPreviaMutation.isPending} className="self-start">
              Calcular vista previa
            </Button>

            {vistaPrevia && (
              <div className="mt-2 flex flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="text-xs text-zinc-500">Total a repartir</p>
                      <p className="text-lg font-bold text-zinc-900">
                        {formatearPrecio(vistaPrevia.totalPropinas)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="text-xs text-zinc-500">Participantes</p>
                      <p className="text-lg font-bold text-zinc-900">
                        {vistaPrevia.participantes.length}
                      </p>
                    </div>
                  </div>
                </div>

                <Table
                  columnas={[
                    { encabezado: 'Persona', render: (p) => nombrePersonal(p.usuario.personal) },
                    {
                      encabezado: 'Horas',
                      render: (p) => (p.horas !== null ? p.horas.toFixed(2) : '—'),
                    },
                    { encabezado: 'Monto', render: (p) => formatearPrecio(p.monto) },
                  ]}
                  filas={vistaPrevia.participantes}
                  claveFila={(p) => p.usuario.id}
                  vacio="Nadie tiene un turno cerrado en este período"
                />

                <Input
                  label="Observación (opcional)"
                  placeholder="Ej. reparto de la noche del sábado"
                  {...form.register('observacion')}
                />

                {crearMutation.isError && (
                  <Alert
                    tipo="error"
                    mensaje={mensajeError(crearMutation.error, 'No se pudo registrar el reparto')}
                  />
                )}

                <Button
                  variante="secondary"
                  className="self-start"
                  cargando={crearMutation.isPending}
                  onClick={() => crearMutation.mutate(form.getValues('observacion'))}
                >
                  Confirmar reparto
                </Button>
              </div>
            )}
          </form>
        </Panel>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Historial de repartos</h2>
        <Table
          columnas={[
              {
                encabezado: 'Período',
                render: (r) =>
                  `${formatearFechaHora(r.fechaDesde)} — ${formatearFechaHora(r.fechaHasta)}`,
              },
              { encabezado: 'Método', render: (r) => ETIQUETA_METODO[r.metodo] },
              { encabezado: 'Total', render: (r) => formatearPrecio(r.totalPropinas) },
              { encabezado: 'Participantes', render: (r) => r.detalles.length },
              {
                encabezado: 'Registrado por',
                render: (r) => nombrePersonal(r.usuarioRegistro.personal),
              },
              {
                encabezado: '',
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => setRepartoViendo(r)}
                    className="text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
                  >
                    Ver
                  </button>
                ),
              },
            ]}
            filas={historialQuery.data ?? []}
            claveFila={(r) => r.id}
            vacio="Aún no se registró ningún reparto"
            cargando={historialQuery.isLoading}
            error={
              historialQuery.isError
                ? mensajeError(historialQuery.error, 'No se pudo cargar el historial')
                : undefined
            }
          onReintentar={() => void historialQuery.refetch()}
        />
      </div>

      <RepartoDetalleModal reparto={repartoViendo} onCerrar={() => setRepartoViendo(null)} />
    </div>
  );
}
