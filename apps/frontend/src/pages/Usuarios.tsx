import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
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
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { CrearUsuarioInput, ActualizarUsuarioInput } from '../services/usuarios.service';
import type { Usuario } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

export function Usuarios() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [usuarioEliminando, setUsuarioEliminando] = useState<Usuario | null>(null);

  const usuariosQuery = useQuery({
    queryKey: ['usuarios'],
    queryFn: usuariosService.listarUsuarios,
  });
  const personalQuery = useQuery({
    queryKey: ['personal'],
    queryFn: personalService.listarPersonal,
  });
  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: rolesService.listarRoles });

  const crearForm = useForm<CrearUsuarioInput>();
  const editarForm = useForm<ActualizarUsuarioInput>();

  const crearMutation = useMutation({
    mutationFn: usuariosService.crearUsuario,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarUsuarioInput) =>
      usuariosService.actualizarUsuario(usuarioEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setUsuarioEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => usuariosService.eliminarUsuario(usuarioEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setUsuarioEliminando(null);
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
          {
            encabezado: '',
            render: (u) => (
              <div className="flex items-center gap-3">
                {tienePermiso('usuarios.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setUsuarioEditando(u);
                      editarForm.reset({ email: u.email, rolId: u.rol.id, activo: u.activo });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('usuarios.eliminar') && (
                  <button
                    type="button"
                    onClick={() => setUsuarioEliminando(u)}
                    className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Desactivar
                  </button>
                )}
              </div>
            ),
          },
        ]}
        filas={usuariosQuery.data ?? []}
        claveFila={(u) => u.id}
        vacio="No hay usuarios registrados"
      />

      <Modal abierto={modalAbierto} titulo="Nuevo usuario" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el usuario')}
            />
          )}

          <div>
            <label className={labelClass}>Personal</label>
            <select
              {...crearForm.register('personalId', { required: true })}
              className={inputClass}
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
            <label className={labelClass}>Rol</label>
            <select {...crearForm.register('rolId', { required: true })} className={inputClass}>
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
            <input
              type="email"
              {...crearForm.register('email', { required: true })}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Contraseña</label>
            <input
              type="password"
              {...crearForm.register('password', { required: true, minLength: 8 })}
              className={inputClass}
            />
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear usuario
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={usuarioEditando !== null}
        titulo="Editar usuario"
        onCerrar={() => setUsuarioEditando(null)}
      >
        {usuarioEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el usuario')}
              />
            )}

            <div>
              <label className={labelClass}>Correo electrónico</label>
              <input
                type="email"
                {...editarForm.register('email', { required: true })}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Rol</label>
              <select {...editarForm.register('rolId', { required: true })} className={inputClass}>
                {rolesQuery.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                {...editarForm.register('activo')}
                className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
              />
              Cuenta activa
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
        abierto={usuarioEliminando !== null}
        titulo="Desactivar usuario"
        mensaje={`¿Seguro que deseas desactivar a "${usuarioEliminando?.personal.nombres}"? Perderá acceso al sistema, pero su registro se conserva.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setUsuarioEliminando(null)}
      />
    </div>
  );
}
