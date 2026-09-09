import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Beef, Pencil, Trash2 } from 'lucide-react';
import * as insumosService from '../services/insumos.service';
import * as catalogosService from '../services/catalogos.service';
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
import { formatearPrecio } from '../utils/formato';
import type { ActualizarInsumoInput, CrearInsumoInput } from '../services/insumos.service';
import type { Insumo } from '../types/api';

export function Insumos() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [insumoEditando, setInsumoEditando] = useState<Insumo | null>(null);
  const [insumoEliminando, setInsumoEliminando] = useState<Insumo | null>(null);

  const insumosQuery = useQuery({ queryKey: ['insumos'], queryFn: insumosService.listarInsumos });
  const unidadesQuery = useQuery({
    queryKey: ['unidades-medida'],
    queryFn: catalogosService.listarUnidadesMedida,
  });
  const tiposAfectacionIgvQuery = useQuery({
    queryKey: ['tipos-afectacion-igv'],
    queryFn: catalogosService.listarTiposAfectacionIgv,
  });

  const crearForm = useForm<CrearInsumoInput>();
  const editarForm = useForm<ActualizarInsumoInput>();

  const crearMutation = useMutation({
    mutationFn: insumosService.crearInsumo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarInsumoInput) =>
      insumosService.actualizarInsumo(insumoEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      setInsumoEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => insumosService.eliminarInsumo(insumoEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insumos'] });
      setInsumoEliminando(null);
    },
  });

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setInsumoEditando(null);
    editarMutation.reset();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Insumos</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Materia prima que se consume al preparar los platillos — no se vende directamente
          </p>
        </div>
        {tienePermiso('insumos.crear') && (
          <Button icono={<Beef className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nuevo insumo
          </Button>
        )}
      </div>

      <Table
        columnas={[
          { encabezado: 'Nombre', render: (i) => i.nombre },
          { encabezado: 'Descripción', render: (i) => i.descripcion ?? '—' },
          { encabezado: 'Unidad', render: (i) => i.unidadMedida.nombre },
          { encabezado: 'IGV', render: (i) => i.tipoAfectacionIgv.nombre },
          {
            encabezado: 'Último costo',
            render: (i) => (i.ultimoCosto != null ? formatearPrecio(i.ultimoCosto) : '—'),
          },
          {
            encabezado: 'Estado',
            render: (i) => (
              <Badge tono={i.activo ? 'exito' : 'neutral'}>
                {i.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (i) => (
              <div className="flex items-center gap-3">
                {tienePermiso('insumos.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setInsumoEditando(i);
                      editarForm.reset({
                        nombre: i.nombre,
                        descripcion: i.descripcion ?? '',
                        unidadMedidaId: i.unidadMedida.id,
                        tipoAfectacionIgvId: i.tipoAfectacionIgv.id,
                        activo: i.activo,
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('insumos.eliminar') && i.activo && (
                  <button
                    type="button"
                    onClick={() => setInsumoEliminando(i)}
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
        filas={insumosQuery.data ?? []}
        claveFila={(i) => i.id}
        vacio="No hay insumos registrados"
        cargando={insumosQuery.isLoading}
        error={
          insumosQuery.isError
            ? mensajeError(insumosQuery.error, 'No se pudieron cargar los insumos')
            : undefined
        }
        onReintentar={() => void insumosQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nuevo insumo" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el insumo')}
            />
          )}

          <Input
            label="Nombre"
            autoFocus
            placeholder="Ej. Pechuga de pollo"
            error={crearForm.formState.errors.nombre?.message}
            {...crearForm.register('nombre', { required: 'El nombre es obligatorio' })}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Unidad de medida"
              error={crearForm.formState.errors.unidadMedidaId?.message}
              {...crearForm.register('unidadMedidaId', { required: 'Selecciona una unidad' })}
            >
              <option value="">Seleccionar…</option>
              {unidadesQuery.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>

            <Select
              label="Afectación del IGV"
              ayuda="Ej. verduras/frutas frescas suelen ser exoneradas."
              error={crearForm.formState.errors.tipoAfectacionIgvId?.message}
              {...crearForm.register('tipoAfectacionIgvId', {
                required: 'Selecciona la afectación del IGV',
              })}
            >
              <option value="">Seleccionar…</option>
              {tiposAfectacionIgvQuery.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Descripción"
            ayuda="Opcional."
            error={crearForm.formState.errors.descripcion?.message}
            {...crearForm.register('descripcion')}
          />

          <FormActions
            enviar="Crear insumo"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={insumoEditando !== null} titulo="Editar insumo" onCerrar={cerrarEditar}>
        {insumoEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el insumo')}
              />
            )}

            <Input
              label="Nombre"
              error={editarForm.formState.errors.nombre?.message}
              {...editarForm.register('nombre', { required: 'El nombre es obligatorio' })}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Unidad de medida"
                error={editarForm.formState.errors.unidadMedidaId?.message}
                {...editarForm.register('unidadMedidaId', { required: 'Selecciona una unidad' })}
              >
                {unidadesQuery.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>

              <Select
                label="Afectación del IGV"
                error={editarForm.formState.errors.tipoAfectacionIgvId?.message}
                {...editarForm.register('tipoAfectacionIgvId', {
                  required: 'Selecciona la afectación del IGV',
                })}
              >
                {tiposAfectacionIgvQuery.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </Select>
            </div>

            <Input
              label="Descripción"
              ayuda="Opcional."
              error={editarForm.formState.errors.descripcion?.message}
              {...editarForm.register('descripcion')}
            />

            <Checkbox
              label="Insumo activo"
              ayuda="Un insumo inactivo no se puede agregar a nuevas recetas."
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
        abierto={insumoEliminando !== null}
        titulo="Desactivar insumo"
        mensaje={`¿Seguro que deseas desactivar "${insumoEliminando?.nombre}"? Ya no podrá agregarse a nuevas recetas, pero su historial de movimientos se conserva.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setInsumoEliminando(null)}
      />
    </div>
  );
}
