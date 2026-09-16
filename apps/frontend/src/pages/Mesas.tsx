import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Utensils } from 'lucide-react';
import * as mesasService from '../services/mesas.service';
import * as salonesService from '../services/salones.service';
import * as reservasService from '../services/reservas.service';
import * as pedidosService from '../services/pedidos.service';
import * as empresaService from '../services/empresa.service';
import { useAuth } from '../context/AuthContext';
import { PlanoMesas } from '../components/PlanoMesas';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { EmptyState } from '../components/ui/EmptyState';
import { Spinner } from '../components/ui/Spinner';
import { mensajeError } from '../utils/errores';
import type { ActualizarMesaInput, CrearMesaInput } from '../services/mesas.service';
import type { Mesa } from '../types/api';

export function Mesas() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [mesaEditando, setMesaEditando] = useState<Mesa | null>(null);
  const [mesaEliminando, setMesaEliminando] = useState<Mesa | null>(null);
  const [mesaQr, setMesaQr] = useState<Mesa | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [filtroSalon, setFiltroSalon] = useState<string>('todos');

  const mesasQuery = useQuery({ queryKey: ['mesas'], queryFn: mesasService.listarMesas });
  const salonesQuery = useQuery({ queryKey: ['salones'], queryFn: salonesService.listarSalones });
  const reservasQuery = useQuery({
    queryKey: ['reservas'],
    queryFn: reservasService.listarReservas,
  });
  const pedidosQuery = useQuery({
    queryKey: ['pedidos'],
    queryFn: pedidosService.listarPedidos,
  });
  // El slug de la propia empresa: el QR de autopedido apunta a `/carta/:slug?mesa=:id`, la
  // misma carta pública de siempre, solo que con la mesa ya identificada.
  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: empresaService.listarEmpresas,
  });
  const slug = empresasQuery.data?.[0]?.slug;
  const enlaceQr = mesaQr && slug ? `${window.location.origin}/carta/${slug}?mesa=${mesaQr.id}` : null;

  const crearForm = useForm<CrearMesaInput>();
  const editarForm = useForm<ActualizarMesaInput>();

  const crearMutation = useMutation({
    mutationFn: mesasService.crearMesa,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarMesaInput) =>
      mesasService.actualizarMesa(mesaEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setMesaEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => mesasService.eliminarMesa(mesaEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mesas'] });
      setMesaEliminando(null);
    },
  });

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setMesaEditando(null);
    editarMutation.reset();
  }

  const mesas = mesasQuery.data ?? [];
  const mesasFiltradas =
    filtroSalon === 'todos' ? mesas : mesas.filter((m) => m.salon.id === filtroSalon);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Mesas</h1>
          <p className="mt-1 text-sm text-zinc-500">Mesas disponibles por salón</p>
        </div>
        {tienePermiso('mesas.crear') && (
          <Button icono={<Utensils className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nueva mesa
          </Button>
        )}
      </div>

      {salonesQuery.data && salonesQuery.data.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFiltroSalon('todos')}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filtroSalon === 'todos'
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Todos
          </button>
          {salonesQuery.data.map((salon) => (
            <button
              key={salon.id}
              type="button"
              onClick={() => setFiltroSalon(salon.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filtroSalon === salon.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {salon.nombre}
            </button>
          ))}
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-medium text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Libre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Ocupada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Reservada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-zinc-300" /> Inactiva
        </span>
      </div>

      {mesasQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : mesasQuery.isError ? (
        <EmptyState
          icono={Utensils}
          titulo="No se pudieron cargar las mesas"
          descripcion={mensajeError(mesasQuery.error, 'Vuelve a intentarlo en un momento.')}
        />
      ) : (
        <PlanoMesas
          mesas={mesasFiltradas}
          pedidos={pedidosQuery.data ?? []}
          reservas={reservasQuery.data ?? []}
          vacio="No hay mesas registradas"
          puedeEditar={tienePermiso('mesas.editar')}
          puedeEliminar={tienePermiso('mesas.eliminar')}
          onEditar={(m) => {
            setMesaEditando(m);
            editarForm.reset({
              salonId: m.salon.id,
              numero: m.numero,
              capacidad: m.capacidad,
              activo: m.activo,
            });
          }}
          onEliminar={(m) => setMesaEliminando(m)}
          onVerQr={(m) => {
            setMesaQr(m);
            setCopiado(false);
          }}
        />
      )}

      <Modal abierto={modalAbierto} titulo="Nueva mesa" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear la mesa')}
            />
          )}

          <Select
            label="Salón"
            error={crearForm.formState.errors.salonId?.message}
            {...crearForm.register('salonId', { required: 'Selecciona el salón' })}
          >
            <option value="">Seleccionar…</option>
            {salonesQuery.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Número"
              placeholder="Ej. 1, A-05"
              ayuda="Único dentro del salón."
              error={crearForm.formState.errors.numero?.message}
              {...crearForm.register('numero', { required: 'El número es obligatorio' })}
            />
            <Input
              label="Capacidad"
              type="number"
              min="1"
              ayuda="Cantidad de personas."
              error={crearForm.formState.errors.capacidad?.message}
              {...crearForm.register('capacidad', {
                required: 'La capacidad es obligatoria',
                valueAsNumber: true,
                min: { value: 1, message: 'La capacidad debe ser al menos 1' },
              })}
            />
          </div>

          <FormActions
            enviar="Crear mesa"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={mesaEditando !== null} titulo="Editar mesa" onCerrar={cerrarEditar}>
        {mesaEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar la mesa')}
              />
            )}

            <Select
              label="Salón"
              error={editarForm.formState.errors.salonId?.message}
              {...editarForm.register('salonId', { required: 'Selecciona el salón' })}
            >
              {salonesQuery.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Número"
                ayuda="Único dentro del salón."
                error={editarForm.formState.errors.numero?.message}
                {...editarForm.register('numero', { required: 'El número es obligatorio' })}
              />
              <Input
                label="Capacidad"
                type="number"
                min="1"
                ayuda="Cantidad de personas."
                error={editarForm.formState.errors.capacidad?.message}
                {...editarForm.register('capacidad', {
                  required: 'La capacidad es obligatoria',
                  valueAsNumber: true,
                  min: { value: 1, message: 'La capacidad debe ser al menos 1' },
                })}
              />
            </div>

            <Checkbox
              label="Mesa activa"
              ayuda="Las mesas inactivas no admiten nuevos pedidos ni reservas."
              {...editarForm.register('activo')}
            />

            <FormActions
              enviar="Guardar cambios"
              onCancelar={cerrarEditar}
              enviando={editarForm.formState.isSubmitting || editarMutation.isPending}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        abierto={mesaEliminando !== null}
        titulo="Eliminar mesa"
        mensaje={`¿Seguro que deseas eliminar la mesa "${mesaEliminando?.numero}" del salón "${mesaEliminando?.salon.nombre}"? Esta acción no se puede deshacer.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setMesaEliminando(null)}
      />

      <Modal
        abierto={mesaQr !== null}
        titulo={mesaQr ? `QR de autopedido — Mesa ${mesaQr.numero}` : ''}
        descripcion="El cliente lo escanea desde su celular, ve la carta y arma su pedido directo a esta mesa."
        onCerrar={() => setMesaQr(null)}
      >
        {mesaQr &&
          (enlaceQr ? (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <QRCodeSVG value={enlaceQr} size={220} />
              </div>
              <div className="flex w-full items-end gap-2">
                <Input label="Enlace" value={enlaceQr} readOnly className="flex-1" />
                <Button
                  type="button"
                  variante="secondary"
                  icono={<Copy className="h-4 w-4" />}
                  onClick={() => {
                    void navigator.clipboard.writeText(enlaceQr).then(() => setCopiado(true));
                  }}
                >
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              <p className="text-center text-xs text-zinc-500">
                Imprímelo y pégalo en la mesa — un clic derecho sobre el QR permite guardarlo
                como imagen.
              </p>
            </div>
          ) : (
            <Alert
              tipo="advertencia"
              mensaje="No se pudo obtener el enlace de tu carta pública. Verifica que tu empresa tenga configurada la carta en Empresa."
            />
          ))}
      </Modal>
    </div>
  );
}
