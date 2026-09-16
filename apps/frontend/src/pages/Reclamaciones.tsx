import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { MessageSquareWarning } from 'lucide-react';
import * as reclamacionesService from '../services/reclamaciones.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Textarea } from '../components/ui/Textarea';
import { FormActions } from '../components/ui/FormActions';
import { formatearFechaHora, formatearPrecio, nombrePersonal } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import type { EstadoReclamacion, Reclamacion, TipoReclamacion } from '../types/api';

const ETIQUETA_TIPO: Record<TipoReclamacion, string> = {
  reclamo: 'Reclamo',
  queja: 'Queja',
};

const ETIQUETA_ESTADO: Record<EstadoReclamacion, string> = {
  pendiente: 'Pendiente',
  atendido: 'Atendido',
};

const TONO_ESTADO: Record<EstadoReclamacion, 'exito' | 'neutral' | 'peligro'> = {
  pendiente: 'peligro',
  atendido: 'exito',
};

interface RespuestaInput {
  respuestaProveedor: string;
}

function ReclamacionModal({
  reclamacion,
  puedeResponder,
  onCerrar,
}: {
  reclamacion: Reclamacion | null;
  puedeResponder: boolean;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<RespuestaInput>();

  const responderMutation = useMutation({
    mutationFn: (values: RespuestaInput) =>
      reclamacionesService.responderReclamacion(reclamacion!.id, values.respuestaProveedor),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reclamaciones'] });
      form.reset({ respuestaProveedor: '' });
    },
  });

  return (
    <Modal
      abierto={reclamacion !== null}
      titulo={
        reclamacion
          ? `${ETIQUETA_TIPO[reclamacion.tipo]} N° ${String(reclamacion.numero).padStart(6, '0')}`
          : ''
      }
      onCerrar={onCerrar}
      tamano="lg"
    >
      {reclamacion && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <Badge tono={TONO_ESTADO[reclamacion.estado]}>
              {ETIQUETA_ESTADO[reclamacion.estado]}
            </Badge>
            <span className="text-xs text-zinc-500">
              {formatearFechaHora(reclamacion.creadoEn)}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-zinc-500">Consumidor</p>
              <p className="font-medium text-zinc-900">
                {reclamacion.consumidorNombres} {reclamacion.consumidorApellidos}
              </p>
              <p className="text-xs text-zinc-500">
                {reclamacion.tipoDocumentoIdentidad.nombre} {reclamacion.consumidorNumeroDocumento}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Contacto</p>
              <p className="font-medium text-zinc-900">{reclamacion.consumidorEmail}</p>
              {reclamacion.consumidorTelefono && (
                <p className="text-xs text-zinc-500">{reclamacion.consumidorTelefono}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <p className="text-zinc-500">Domicilio</p>
              <p className="font-medium text-zinc-900">{reclamacion.consumidorDomicilio}</p>
            </div>
            {reclamacion.esMenorEdad && (
              <div className="sm:col-span-2">
                <p className="text-zinc-500">Apoderado (consumidor menor de edad)</p>
                <p className="font-medium text-zinc-900">
                  {reclamacion.apoderadoNombre} · {reclamacion.apoderadoNumeroDocumento}
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              Producto o servicio
            </p>
            <p className="mt-1 text-sm text-zinc-900">{reclamacion.descripcionBien}</p>
            {reclamacion.montoReclamado != null && (
              <p className="mt-1 text-sm text-zinc-500">
                Monto reclamado: {formatearPrecio(reclamacion.montoReclamado)}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Detalle</p>
            <p className="mt-1 text-sm whitespace-pre-line text-zinc-900">{reclamacion.detalle}</p>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">Solicita</p>
            <p className="mt-1 text-sm whitespace-pre-line text-zinc-900">{reclamacion.pedido}</p>
          </div>

          {reclamacion.estado === 'atendido' ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                Respuesta
                {reclamacion.usuarioAtendio &&
                  ` · ${nombrePersonal(reclamacion.usuarioAtendio.personal)}`}
                {reclamacion.fechaRespuesta &&
                  ` · ${formatearFechaHora(reclamacion.fechaRespuesta)}`}
              </p>
              <p className="mt-1 text-sm whitespace-pre-line text-zinc-900">
                {reclamacion.respuestaProveedor}
              </p>
            </div>
          ) : (
            puedeResponder && (
              <form
                onSubmit={form.handleSubmit((values) => responderMutation.mutate(values))}
                className="flex flex-col gap-3 border-t border-zinc-200 pt-4"
                noValidate
              >
                {responderMutation.isError && (
                  <Alert
                    tipo="error"
                    mensaje={mensajeError(
                      responderMutation.error,
                      'No se pudo registrar la respuesta',
                    )}
                  />
                )}
                <Textarea
                  label="Respuesta al consumidor"
                  ayuda="El reglamento exige responder en un plazo máximo de 30 días calendario."
                  error={form.formState.errors.respuestaProveedor?.message}
                  {...form.register('respuestaProveedor', { required: 'Escribe una respuesta' })}
                />
                <FormActions
                  enviar="Registrar respuesta"
                  enviandoTexto="Guardando…"
                  onCancelar={onCerrar}
                  enviando={form.formState.isSubmitting || responderMutation.isPending}
                />
              </form>
            )
          )}
        </div>
      )}
    </Modal>
  );
}

export function Reclamaciones() {
  const { tienePermiso } = useAuth();
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoReclamacion>('todos');
  const [verReclamacion, setVerReclamacion] = useState<Reclamacion | null>(null);

  const reclamacionesQuery = useQuery({
    queryKey: ['reclamaciones'],
    queryFn: reclamacionesService.listarReclamaciones,
  });

  const reclamaciones = reclamacionesQuery.data ?? [];
  const reclamacionesFiltradas =
    filtroEstado === 'todos'
      ? reclamaciones
      : reclamaciones.filter((r) => r.estado === filtroEstado);

  // El modal se re-lee de la lista ya invalidada (no del objeto viejo capturado al abrirlo),
  // para mostrar el estado "atendido" apenas se registra la respuesta sin cerrar y reabrir.
  const reclamacionAbierta = verReclamacion
    ? (reclamaciones.find((r) => r.id === verReclamacion.id) ?? verReclamacion)
    : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Libro de Reclamaciones</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Reclamos y quejas registrados desde la carta pública — obligatorio por Ley 29571
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {(['todos', 'pendiente', 'atendido'] as const).map((valor) => (
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
            {valor === 'todos' ? 'Todos' : ETIQUETA_ESTADO[valor]}
          </button>
        ))}
      </div>

      <Table
        columnas={[
          {
            encabezado: 'N°',
            render: (r) => (
              <button
                type="button"
                onClick={() => setVerReclamacion(r)}
                className="font-medium text-orange-600 hover:text-orange-700 hover:underline"
              >
                {String(r.numero).padStart(6, '0')}
              </button>
            ),
          },
          {
            encabezado: 'Tipo',
            render: (r) => (
              <span className="flex items-center gap-1.5">
                <MessageSquareWarning className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                {ETIQUETA_TIPO[r.tipo]}
              </span>
            ),
          },
          {
            encabezado: 'Consumidor',
            render: (r) => `${r.consumidorNombres} ${r.consumidorApellidos}`,
          },
          { encabezado: 'Producto/servicio', render: (r) => r.descripcionBien },
          { encabezado: 'Fecha', render: (r) => formatearFechaHora(r.creadoEn) },
          {
            encabezado: 'Estado',
            render: (r) => <Badge tono={TONO_ESTADO[r.estado]}>{ETIQUETA_ESTADO[r.estado]}</Badge>,
          },
        ]}
        filas={reclamacionesFiltradas}
        claveFila={(r) => r.id}
        vacio="No hay reclamos ni quejas registrados"
        cargando={reclamacionesQuery.isLoading}
        error={
          reclamacionesQuery.isError
            ? mensajeError(reclamacionesQuery.error, 'No se pudo cargar el libro de reclamaciones')
            : undefined
        }
        onReintentar={() => void reclamacionesQuery.refetch()}
      />

      <ReclamacionModal
        reclamacion={reclamacionAbierta}
        puedeResponder={tienePermiso('reclamaciones.responder')}
        onCerrar={() => setVerReclamacion(null)}
      />
    </div>
  );
}
