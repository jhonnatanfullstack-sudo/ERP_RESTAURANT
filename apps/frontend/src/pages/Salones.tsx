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
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { mensajeError } from '../utils/errores';
import type { ActualizarSalonInput, CrearSalonInput } from '../services/salones.service';
import type { Salon } from '../types/api';

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

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setSalonEditando(null);
    editarMutation.reset();
  }

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
        cargando={salonesQuery.isLoading}
        error={
          salonesQuery.isError
            ? mensajeError(salonesQuery.error, 'No se pudieron cargar los salones')
            : undefined
        }
        onReintentar={() => void salonesQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nuevo salón" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el salón')}
            />
          )}

          <Input
            label="Nombre"
            autoFocus
            ayuda="Ej. Primer piso, Terraza, Sala VIP."
            error={crearForm.formState.errors.nombre?.message}
            {...crearForm.register('nombre', { required: 'El nombre es obligatorio' })}
          />

          <Input
            label="Descripción"
            ayuda="Opcional."
            error={crearForm.formState.errors.descripcion?.message}
            {...crearForm.register('descripcion')}
          />

          <FormActions
            enviar="Crear salón"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={salonEditando !== null} titulo="Editar salón" onCerrar={cerrarEditar}>
        {salonEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el salón')}
              />
            )}

            <Input
              label="Nombre"
              ayuda="Ej. Primer piso, Terraza, Sala VIP."
              error={editarForm.formState.errors.nombre?.message}
              {...editarForm.register('nombre', { required: 'El nombre es obligatorio' })}
            />

            <Input
              label="Descripción"
              ayuda="Opcional."
              error={editarForm.formState.errors.descripcion?.message}
              {...editarForm.register('descripcion')}
            />

            <Checkbox
              label="Salón activo"
              ayuda="Los salones inactivos no admiten nuevas mesas ni pedidos."
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
