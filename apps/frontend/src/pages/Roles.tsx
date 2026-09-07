import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import * as rolesService from '../services/roles.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import type { CrearRolInput } from '../services/roles.service';

export function Roles() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesService.listarRoles });
  const permisosQuery = useQuery({ queryKey: ['permisos'], queryFn: rolesService.listarPermisos });

  const { register, handleSubmit, reset, formState } = useForm<CrearRolInput>({
    defaultValues: { permisoIds: [] },
  });

  const crearMutation = useMutation({
    mutationFn: rolesService.crearRol,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      setModalAbierto(false);
      reset();
    },
  });

  if (rolesQuery.isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Roles</h1>
        {tienePermiso('roles.crear') && (
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Nuevo rol
          </button>
        )}
      </div>

      <Table
        columnas={[
          { encabezado: 'Nombre', render: (r) => r.nombre },
          { encabezado: 'Descripción', render: (r) => r.descripcion ?? '—' },
          { encabezado: 'Permisos', render: (r) => `${r.permisos.length} asignados` },
        ]}
        filas={rolesQuery.data ?? []}
        claveFila={(r) => r.id}
        vacio="No hay roles registrados"
      />

      <Modal abierto={modalAbierto} titulo="Nuevo rol" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={
                (crearMutation.error as { response?: { data?: { message?: string } } })?.response
                  ?.data?.message ?? 'No se pudo crear el rol'
              }
            />
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre</label>
            <input
              {...register('nombre', { required: true })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Descripción</label>
            <input
              {...register('descripcion')}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Permisos</span>
            <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-3">
              {permisosQuery.data?.map((permiso) => (
                <label
                  key={permiso.id}
                  className="flex items-center gap-2 py-1 text-sm text-slate-700"
                >
                  <input type="checkbox" value={permiso.id} {...register('permisoIds')} />
                  {permiso.codigo}
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={formState.isSubmitting || crearMutation.isPending}
            className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Crear rol
          </button>
        </form>
      </Modal>
    </div>
  );
}
