import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { UserPlus } from 'lucide-react';
import * as usuariosService from '../services/usuarios.service';
import * as personalService from '../services/personal.service';
import * as rolesService from '../services/roles.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import type { CrearUsuarioInput } from '../services/usuarios.service';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

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
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Usuarios</h1>
          <p className="mt-1 text-sm text-zinc-500">Cuentas de acceso del personal al sistema</p>
        </div>
        {tienePermiso('usuarios.crear') && (
          <Button icono={<UserPlus className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nuevo usuario
          </Button>
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
          {
            encabezado: 'Estado',
            render: (u) => (
              <Badge tono={u.activo ? 'exito' : 'neutral'}>
                {u.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
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
            <label className={labelClass}>Personal</label>
            <select {...register('personalId', { required: true })} className={inputClass}>
              <option value="">Seleccionar…</option>
              {personalSinUsuario.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombres} {p.apellidoPaterno} — {p.numeroDocumento}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Rol</label>
            <select {...register('rolId', { required: true })} className={inputClass}>
              <option value="">Seleccionar…</option>
              {rolesQuery.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Correo electrónico</label>
            <input type="email" {...register('email', { required: true })} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Contraseña</label>
            <input
              type="password"
              {...register('password', { required: true, minLength: 8 })}
              className={inputClass}
            />
          </div>

          <Button
            type="submit"
            disabled={formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear usuario
          </Button>
        </form>
      </Modal>
    </div>
  );
}
