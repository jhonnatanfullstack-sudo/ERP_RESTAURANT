import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, Star, Trash2, Warehouse } from 'lucide-react';
import * as almacenesService from '../services/almacenes.service';
import * as empresaService from '../services/empresa.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { mensajeError } from '../utils/errores';
import type { ActualizarAlmacenInput, CrearAlmacenInput } from '../services/almacenes.service';
import type { Almacen } from '../types/api';

export function Almacenes() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [almacenEditando, setAlmacenEditando] = useState<Almacen | null>(null);
  const [almacenEliminando, setAlmacenEliminando] = useState<Almacen | null>(null);

  const almacenesQuery = useQuery({
    queryKey: ['almacenes'],
    queryFn: almacenesService.listarAlmacenes,
  });
  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: empresaService.listarEmpresas,
  });

  const crearForm = useForm<CrearAlmacenInput>();
  const editarForm = useForm<ActualizarAlmacenInput>();

  const crearMutation = useMutation({
    mutationFn: almacenesService.crearAlmacen,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['almacenes'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarAlmacenInput) =>
      almacenesService.actualizarAlmacen(almacenEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['almacenes'] });
      setAlmacenEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => almacenesService.eliminarAlmacen(almacenEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['almacenes'] });
      setAlmacenEliminando(null);
    },
  });

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setAlmacenEditando(null);
    editarMutation.reset();
  }

  const empresas = empresasQuery.data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Almacenes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Ubicaciones físicas donde se guarda mercadería e insumos
          </p>
        </div>
        {tienePermiso('almacenes.crear') && (
          <Button
            icono={<Warehouse className="h-4 w-4" />}
            onClick={() => setModalAbierto(true)}
            disabled={empresas.length === 0}
          >
            Nuevo almacén
          </Button>
        )}
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Nombre',
            render: (a) => (
              <span className="flex items-center gap-1.5">
                {a.nombre}
                {a.esPrincipal && (
                  <Star
                    className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                    aria-label="Principal"
                  />
                )}
              </span>
            ),
          },
          { encabezado: 'Empresa', render: (a) => a.empresa.razonSocial },
          { encabezado: 'Dirección', render: (a) => a.direccion ?? '—' },
          {
            encabezado: 'Estado',
            render: (a) => (
              <Badge tono={a.activo ? 'exito' : 'neutral'}>
                {a.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (a) => (
              <div className="flex items-center gap-3">
                {tienePermiso('almacenes.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setAlmacenEditando(a);
                      editarForm.reset({
                        nombre: a.nombre,
                        direccion: a.direccion ?? '',
                        esPrincipal: a.esPrincipal,
                        activo: a.activo,
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('almacenes.eliminar') && (
                  <button
                    type="button"
                    onClick={() => setAlmacenEliminando(a)}
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
        filas={almacenesQuery.data ?? []}
        claveFila={(a) => a.id}
        vacio="No hay almacenes registrados"
        vacioDescripcion={
          empresas.length === 0
            ? 'Registra primero los datos de la empresa en "Empresa".'
            : 'Sin un almacén marcado como principal, los movimientos automáticos (consumo de cocina, venta directa) no se registran.'
        }
        cargando={almacenesQuery.isLoading}
        error={
          almacenesQuery.isError
            ? mensajeError(almacenesQuery.error, 'No se pudieron cargar los almacenes')
            : undefined
        }
        onReintentar={() => void almacenesQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nuevo almacén" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el almacén')}
            />
          )}

          <Select
            label="Empresa"
            error={crearForm.formState.errors.empresaId?.message}
            {...crearForm.register('empresaId', { required: 'Selecciona la empresa' })}
          >
            <option value="">Seleccionar…</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.razonSocial}
              </option>
            ))}
          </Select>

          <Input
            label="Nombre"
            placeholder="Ej. Almacén principal"
            error={crearForm.formState.errors.nombre?.message}
            {...crearForm.register('nombre', { required: 'El nombre es obligatorio' })}
          />

          <Input
            label="Dirección"
            ayuda="Opcional."
            error={crearForm.formState.errors.direccion?.message}
            {...crearForm.register('direccion')}
          />

          <Checkbox
            label="Almacén principal"
            ayuda="El destino/origen por defecto de los movimientos automáticos (consumo de cocina, venta directa). Solo puede haber uno por empresa."
            {...crearForm.register('esPrincipal')}
          />

          <FormActions
            enviar="Crear almacén"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={almacenEditando !== null} titulo="Editar almacén" onCerrar={cerrarEditar}>
        {almacenEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el almacén')}
              />
            )}

            <Input
              label="Nombre"
              error={editarForm.formState.errors.nombre?.message}
              {...editarForm.register('nombre', { required: 'El nombre es obligatorio' })}
            />

            <Input
              label="Dirección"
              ayuda="Opcional."
              error={editarForm.formState.errors.direccion?.message}
              {...editarForm.register('direccion')}
            />

            <Checkbox
              label="Almacén principal"
              ayuda="Marcarlo aquí le quita la marca a cualquier otro almacén de la misma empresa."
              {...editarForm.register('esPrincipal')}
            />

            <Checkbox label="Almacén activo" {...editarForm.register('activo')} />

            <FormActions
              enviar="Guardar cambios"
              onCancelar={cerrarEditar}
              enviando={editarForm.formState.isSubmitting || editarMutation.isPending}
            />
          </form>
        )}
      </Modal>

      <ConfirmDialog
        abierto={almacenEliminando !== null}
        titulo="Eliminar almacén"
        mensaje={`¿Seguro que deseas eliminar "${almacenEliminando?.nombre}"? Solo es posible si no tiene movimientos registrados.`}
        confirmando={eliminarMutation.isPending}
        error={
          eliminarMutation.isError
            ? mensajeError(eliminarMutation.error, 'No se pudo eliminar el almacén')
            : undefined
        }
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setAlmacenEliminando(null)}
      />
    </div>
  );
}
