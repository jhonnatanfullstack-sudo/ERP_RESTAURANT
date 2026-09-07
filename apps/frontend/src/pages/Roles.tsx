import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, ShieldPlus, Trash2 } from 'lucide-react';
import * as rolesService from '../services/roles.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { ActualizarRolInput, CrearRolInput } from '../services/roles.service';
import type { Rol } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

interface EditarRolValues extends ActualizarRolInput {
  permisoIds: string[];
}

export function Roles() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [rolEditando, setRolEditando] = useState<Rol | null>(null);
  const [rolEliminando, setRolEliminando] = useState<Rol | null>(null);

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesService.listarRoles });
  const permisosQuery = useQuery({ queryKey: ['permisos'], queryFn: rolesService.listarPermisos });

  const crearForm = useForm<CrearRolInput>({ defaultValues: { permisoIds: [] } });
  const editarForm = useForm<EditarRolValues>();

  const crearMutation = useMutation({
    mutationFn: rolesService.crearRol,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: async (values: EditarRolValues) => {
      const { permisoIds, ...datos } = values;
      await rolesService.actualizarRol(rolEditando!.id, datos);
      await rolesService.asignarPermisos(rolEditando!.id, permisoIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setRolEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => rolesService.eliminarRol(rolEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setRolEliminando(null);
    },
  });

  if (rolesQuery.isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Roles</h1>
          <p className="mt-1 text-sm text-zinc-500">Roles y sus permisos asignados</p>
        </div>
        {tienePermiso('roles.crear') && (
          <Button icono={<ShieldPlus className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nuevo rol
          </Button>
        )}
      </div>

      <Table
        columnas={[
          { encabezado: 'Nombre', render: (r) => r.nombre },
          { encabezado: 'Descripción', render: (r) => r.descripcion ?? '—' },
          {
            encabezado: 'Permisos',
            render: (r) => <Badge tono="neutral">{r.permisos.length} asignados</Badge>,
          },
          {
            encabezado: '',
            render: (r) => (
              <div className="flex items-center gap-3">
                {tienePermiso('roles.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setRolEditando(r);
                      editarForm.reset({
                        nombre: r.nombre,
                        descripcion: r.descripcion ?? '',
                        permisoIds: r.permisos.map((p) => p.id),
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('roles.eliminar') && (
                  <button
                    type="button"
                    onClick={() => setRolEliminando(r)}
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
        filas={rolesQuery.data ?? []}
        claveFila={(r) => r.id}
        vacio="No hay roles registrados"
      />

      <Modal abierto={modalAbierto} titulo="Nuevo rol" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el rol')}
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

          <div>
            <span className={labelClass}>Permisos</span>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 p-3">
              {permisosQuery.data?.map((permiso) => (
                <label
                  key={permiso.id}
                  className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  <input
                    type="checkbox"
                    value={permiso.id}
                    {...crearForm.register('permisoIds')}
                    className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
                  />
                  {permiso.codigo}
                </label>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear rol
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={rolEditando !== null}
        titulo="Editar rol"
        onCerrar={() => setRolEditando(null)}
      >
        {rolEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el rol')}
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

            <div>
              <span className={labelClass}>Permisos</span>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-200 p-3">
                {permisosQuery.data?.map((permiso) => (
                  <label
                    key={permiso.id}
                    className="flex items-center gap-2.5 rounded-md px-1 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      value={permiso.id}
                      {...editarForm.register('permisoIds')}
                      className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
                    />
                    {permiso.codigo}
                  </label>
                ))}
              </div>
            </div>

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
        abierto={rolEliminando !== null}
        titulo="Eliminar rol"
        mensaje={`¿Seguro que deseas eliminar el rol "${rolEliminando?.nombre}"? Esta acción no se puede deshacer. No se podrá eliminar si hay usuarios con este rol.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setRolEliminando(null)}
      />
    </div>
  );
}
