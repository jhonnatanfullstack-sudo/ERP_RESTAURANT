import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import * as usuariosService from '../services/usuarios.service';
import * as personalService from '../services/personal.service';
import * as rolesService from '../services/roles.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import type { CrearUsuarioInput } from '../services/usuarios.service';

export function Usuarios() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);

  const usuariosQuery = useQuery({
    queryKey: ['usuarios'],
    queryFn: usuariosService.listarUsuarios,
  });
  const personalQuery = useQuery({
    queryKey: ['personal'],
    queryFn: personalService.listarPersonal,
  });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesService.listarRoles });

  const { register, handleSubmit, reset, formState } = useForm<CrearUsuarioInput>();

  const crearMutation = useMutation({
    mutationFn: usuariosService.crearUsuario,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setModalAbierto(false);
      reset();
    },
  });

  const personalSinUsuario =
    personalQuery.data?.filter((p) => !usuariosQuery.data?.some((u) => u.personal.id === p.id)) ??
    [];

  if (usuariosQuery.isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Usuarios</h1>
        {tienePermiso('usuarios.crear') && (
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Nuevo usuario
          </button>
        )}
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Nombre',
            render: (u) => `${u.personal.nombres} ${u.personal.apellidoPaterno ?? ''}`.trim(),
          },
          { encabezado: 'Correo', render: (u) => u.email },
          { encabezado: 'Rol', render: (u) => u.rol.nombre },
          { encabezado: 'Estado', render: (u) => (u.activo ? 'Activo' : 'Inactivo') },
        ]}
        filas={usuariosQuery.data ?? []}
        claveFila={(u) => u.id}
        vacio="No hay usuarios registrados"
      />

      <Modal abierto={modalAbierto} titulo="Nuevo usuario" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={
                (crearMutation.error as { response?: { data?: { message?: string } } })?.response
                  ?.data?.message ?? 'No se pudo crear el usuario'
              }
            />
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Personal</label>
            <select
              {...register('personalId', { required: true })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Seleccionar…</option>
              {personalSinUsuario.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombres} {p.apellidoPaterno} — {p.numeroDocumento}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Rol</label>
            <select
              {...register('rolId', { required: true })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Seleccionar…</option>
              {rolesQuery.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Correo electrónico
            </label>
            <input
              type="email"
              {...register('email', { required: true })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Contraseña</label>
            <input
              type="password"
              {...register('password', { required: true, minLength: 8 })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={formState.isSubmitting || crearMutation.isPending}
            className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Crear usuario
          </button>
        </form>
      </Modal>
    </div>
  );
}
