import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import * as usuariosService from '../services/usuarios.service';
import * as personalService from '../services/personal.service';
import * as rolesService from '../services/roles.service';
import { useAuth } from '../context/AuthContext';
import { nombrePersonal } from '../utils/formato';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Combobox } from '../components/ui/Combobox';
import type { OpcionCombobox } from '../components/ui/Combobox';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { FormField } from '../components/ui/FormField';
import { FormActions } from '../components/ui/FormActions';
import { mensajeError } from '../utils/errores';
import type { CrearUsuarioInput, ActualizarUsuarioInput } from '../services/usuarios.service';
import type { Usuario } from '../types/api';

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

  const opcionesPersonal: OpcionCombobox[] = personalSinUsuario.map((p) => ({
    valor: p.id,
    etiqueta: nombrePersonal(p),
    descripcion: p.numeroDocumento ?? undefined,
  }));

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setUsuarioEditando(null);
    editarMutation.reset();
  }

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
            render: (u) => nombrePersonal(u.personal),
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
        cargando={usuariosQuery.isLoading}
        error={
          usuariosQuery.isError
            ? mensajeError(usuariosQuery.error, 'No se pudieron cargar los usuarios')
            : undefined
        }
        onReintentar={() => void usuariosQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nuevo usuario" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el usuario')}
            />
          )}

          <Controller
            control={crearForm.control}
            name="personalId"
            rules={{ required: 'Selecciona a qué personal pertenece la cuenta' }}
            render={({ field, fieldState }) => (
              <FormField
                id="usuario-personal"
                label="Personal"
                ayuda="Solo aparece el personal que todavía no tiene cuenta."
                error={fieldState.error?.message}
              >
                <Combobox
                  id="usuario-personal"
                  opciones={opcionesPersonal}
                  valor={field.value}
                  onCambiar={field.onChange}
                  placeholder="Buscar personal…"
                  vacio="No hay personal disponible"
                />
              </FormField>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Rol"
              error={crearForm.formState.errors.rolId?.message}
              {...crearForm.register('rolId', { required: 'Selecciona un rol' })}
            >
              <option value="">Seleccionar…</option>
              {rolesQuery.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </Select>

            <Input
              label="Correo electrónico"
              type="email"
              error={crearForm.formState.errors.email?.message}
              {...crearForm.register('email', { required: 'El correo es obligatorio' })}
            />
          </div>

          <Input
            label="Contraseña"
            type="password"
            ayuda="Mínimo 8 caracteres."
            error={crearForm.formState.errors.password?.message}
            {...crearForm.register('password', {
              required: 'La contraseña es obligatoria',
              minLength: { value: 8, message: 'La contraseña debe tener al menos 8 caracteres' },
            })}
          />

          <FormActions
            enviar="Crear usuario"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={usuarioEditando !== null} titulo="Editar usuario" onCerrar={cerrarEditar}>
        {usuarioEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el usuario')}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Correo electrónico"
                type="email"
                error={editarForm.formState.errors.email?.message}
                {...editarForm.register('email', { required: 'El correo es obligatorio' })}
              />

              <Select
                label="Rol"
                error={editarForm.formState.errors.rolId?.message}
                {...editarForm.register('rolId', { required: 'Selecciona un rol' })}
              >
                {rolesQuery.data?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </Select>
            </div>

            <Checkbox
              label="Cuenta activa"
              ayuda="Una cuenta inactiva no puede iniciar sesión."
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
        abierto={usuarioEliminando !== null}
        titulo="Desactivar usuario"
        mensaje={`¿Seguro que deseas desactivar a "${nombrePersonal(usuarioEliminando?.personal)}"? Perderá acceso al sistema, pero su registro se conserva.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setUsuarioEliminando(null)}
      />
    </div>
  );
}
