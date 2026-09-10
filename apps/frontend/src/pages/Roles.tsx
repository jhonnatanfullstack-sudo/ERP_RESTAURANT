import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useForm,
  useWatch,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from 'react-hook-form';
import { Pencil, Search, ShieldPlus, Trash2 } from 'lucide-react';
import * as rolesService from '../services/roles.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { FormActions } from '../components/ui/FormActions';
import { claseCampo, claseLabel } from '../components/ui/campos';
import { mensajeError } from '../utils/errores';
import type { ActualizarRolInput, CrearRolInput } from '../services/roles.service';
import type { Permiso, Rol } from '../types/api';

interface EditarRolValues extends ActualizarRolInput {
  permisoIds: string[];
}

/** Agrupa por el módulo del código de permiso ("usuarios.crear" -> "usuarios"). */
function agruparPorModulo(permisos: Permiso[]): [string, Permiso[]][] {
  const grupos = new Map<string, Permiso[]>();
  for (const permiso of permisos) {
    const modulo = permiso.codigo.split('.')[0] ?? permiso.codigo;
    const actuales = grupos.get(modulo) ?? [];
    actuales.push(permiso);
    grupos.set(modulo, actuales);
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b));
}

interface SelectorPermisosProps<T extends FieldValues> {
  permisos: Permiso[] | undefined;
  register: UseFormRegister<T>;
  campo: Path<T>;
  seleccionados: string[];
  onSeleccionar: (ids: string[]) => void;
}

/** Lista de permisos agrupada por módulo, con búsqueda y selección por grupo. Antes era una
 * lista plana de códigos crudos, imposible de recorrer cuando hay decenas de permisos. */
function SelectorPermisos<T extends FieldValues>({
  permisos,
  register,
  campo,
  seleccionados,
  onSeleccionar,
}: SelectorPermisosProps<T>) {
  const [busqueda, setBusqueda] = useState('');

  const grupos = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const filtrados = (permisos ?? []).filter(
      (p) =>
        !termino ||
        p.codigo.toLowerCase().includes(termino) ||
        p.descripcion?.toLowerCase().includes(termino),
    );
    return agruparPorModulo(filtrados);
  }, [permisos, busqueda]);

  function alternarGrupo(delGrupo: Permiso[], marcarTodos: boolean) {
    const ids = delGrupo.map((p) => p.id);
    onSeleccionar(
      marcarTodos
        ? [...new Set([...seleccionados, ...ids])]
        : seleccionados.filter((id) => !ids.includes(id)),
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className={claseLabel}>Permisos</span>
        <span className="text-xs text-zinc-500">{seleccionados.length} seleccionados</span>
      </div>

      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Filtrar permisos…"
          aria-label="Filtrar permisos"
          className={`${claseCampo()} pl-9`}
        />
      </div>

      <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200">
        {grupos.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-zinc-400">
            No hay permisos que coincidan
          </p>
        )}
        {grupos.map(([modulo, delGrupo]) => {
          const marcados = delGrupo.filter((p) => seleccionados.includes(p.id)).length;
          const todos = marcados === delGrupo.length;
          return (
            <div key={modulo} className="border-b border-zinc-100 last:border-b-0">
              <div className="flex items-center justify-between gap-2 bg-zinc-50 px-3 py-1.5">
                <span className="text-xs font-semibold tracking-wide text-zinc-600 uppercase">
                  {modulo}
                  <span className="ml-1.5 font-normal text-zinc-400">
                    {marcados}/{delGrupo.length}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => alternarGrupo(delGrupo, !todos)}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700"
                >
                  {todos ? 'Quitar todos' : 'Marcar todos'}
                </button>
              </div>
              <div className="px-3 py-1.5">
                {delGrupo.map((permiso) => (
                  <label
                    key={permiso.id}
                    className="flex items-start gap-2.5 rounded-md px-1 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    <input
                      type="checkbox"
                      value={permiso.id}
                      {...register(campo)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
                    />
                    <span>
                      {permiso.codigo}
                      {permiso.descripcion && (
                        <span className="ml-1.5 text-xs text-zinc-400">{permiso.descripcion}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  const permisosCrear = useWatch({ control: crearForm.control, name: 'permisoIds' }) ?? [];
  const permisosEditar = useWatch({ control: editarForm.control, name: 'permisoIds' }) ?? [];

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

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setRolEditando(null);
    editarMutation.reset();
  }

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
        cargando={rolesQuery.isLoading}
        error={
          rolesQuery.isError
            ? mensajeError(rolesQuery.error, 'No se pudieron cargar los roles')
            : undefined
        }
        onReintentar={() => void rolesQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nuevo rol" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el rol')}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nombre"
              autoFocus
              placeholder="Ej. Cajero"
              error={crearForm.formState.errors.nombre?.message}
              {...crearForm.register('nombre', { required: 'El nombre es obligatorio' })}
            />
            <Input
              label="Descripción"
              ayuda="Opcional."
              error={crearForm.formState.errors.descripcion?.message}
              {...crearForm.register('descripcion')}
            />
          </div>

          <SelectorPermisos
            permisos={permisosQuery.data}
            register={crearForm.register}
            campo="permisoIds"
            seleccionados={permisosCrear}
            onSeleccionar={(ids) => crearForm.setValue('permisoIds', ids)}
          />

          <FormActions
            enviar="Crear rol"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={rolEditando !== null} titulo="Editar rol" onCerrar={cerrarEditar}>
        {rolEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el rol')}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nombre"
                error={editarForm.formState.errors.nombre?.message}
                {...editarForm.register('nombre', { required: 'El nombre es obligatorio' })}
              />
              <Input
                label="Descripción"
                ayuda="Opcional."
                error={editarForm.formState.errors.descripcion?.message}
                {...editarForm.register('descripcion')}
              />
            </div>

            <SelectorPermisos
              permisos={permisosQuery.data}
              register={editarForm.register}
              campo="permisoIds"
              seleccionados={permisosEditar}
              onSeleccionar={(ids) => editarForm.setValue('permisoIds', ids)}
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
