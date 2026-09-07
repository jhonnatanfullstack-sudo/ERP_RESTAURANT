import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { DoorOpen, Pencil, Trash2 } from 'lucide-react';
import * as salonesService from '../services/salones.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { ActualizarSalonInput, CrearSalonInput } from '../services/salones.service';
import type { Salon } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

export function Salones() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [salonEditando, setSalonEditando] = useState<Salon | null>(null);
  const [salonEliminando, setSalonEliminando] = useState<Salon | null>(null);

  const salonesQuery = useQuery({ queryKey: ['salones'], queryFn: salonesService.listarSalones });

  const crearForm = useForm<CrearSalonInput>();
  const editarForm = useForm<ActualizarSalonInput>();

  const crearMutation = useMutation({
    mutationFn: salonesService.crearSalon,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salones'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarSalonInput) =>
      salonesService.actualizarSalon(salonEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salones'] });
      setSalonEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => salonesService.eliminarSalon(salonEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salones'] });
      setSalonEliminando(null);
    },
  });

  if (salonesQuery.isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Salones</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Ambientes del local donde se ubican las mesas
          </p>
        </div>
        {tienePermiso('salones.crear') && (
          <Button icono={<DoorOpen className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nuevo salón
          </Button>
        )}
      </div>

      <Table
        columnas={[
          { encabezado: 'Nombre', render: (s) => s.nombre },
          { encabezado: 'Descripción', render: (s) => s.descripcion ?? '—' },
          {
            encabezado: 'Estado',
            render: (s) => (
              <Badge tono={s.activo ? 'exito' : 'neutral'}>
                {s.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (s) => (
              <div className="flex items-center gap-3">
                {tienePermiso('salones.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSalonEditando(s);
                      editarForm.reset({
                        nombre: s.nombre,
                        descripcion: s.descripcion ?? '',
                        activo: s.activo,
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('salones.eliminar') && (
                  <button
                    type="button"
                    onClick={() => setSalonEliminando(s)}
                    className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar
                  </button>
                )}
              </div>
            ),
          },
        ]}
        filas={salonesQuery.data ?? []}
        claveFila={(s) => s.id}
        vacio="No hay salones registrados"
      />

      <Modal abierto={modalAbierto} titulo="Nuevo salón" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el salón')}
            />
          )}

          <div>
            <label className={labelClass}>Nombre</label>
            <input {...crearForm.register('nombre', { required: true })} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <input {...crearForm.register('descripcion')} className={inputClass} />
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear salón
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={salonEditando !== null}
        titulo="Editar salón"
        onCerrar={() => setSalonEditando(null)}
      >
        {salonEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el salón')}
              />
            )}

            <div>
              <label className={labelClass}>Nombre</label>
              <input
                {...editarForm.register('nombre', { required: true })}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Descripción</label>
              <input {...editarForm.register('descripcion')} className={inputClass} />
            </div>

            <label className="flex items-center gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                {...editarForm.register('activo')}
                className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
              />
              Salón activo
            </label>

            <Button
              type="submit"
              disabled={editarForm.formState.isSubmitting || editarMutation.isPending}
              className="mt-2 w-full"
            >
              Guardar cambios
            </Button>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        abierto={salonEliminando !== null}
        titulo="Eliminar salón"
        mensaje={`¿Seguro que deseas eliminar el salón "${salonEliminando?.nombre}"? Esta acción no se puede deshacer.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setSalonEliminando(null)}
      />
    </div>
  );
}
