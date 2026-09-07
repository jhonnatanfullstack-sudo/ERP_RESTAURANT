import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ShieldPlus } from 'lucide-react';
import * as rolesService from '../services/roles.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import type { CrearRolInput } from '../services/roles.service';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

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
            <label className={labelClass}>Nombre</label>
            <input {...register('nombre', { required: true })} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <input {...register('descripcion')} className={inputClass} />
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
                    {...register('permisoIds')}
                    className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
                  />
                  {permiso.codigo}
                </label>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear rol
          </Button>
        </form>
      </Modal>
    </div>
  );
}
