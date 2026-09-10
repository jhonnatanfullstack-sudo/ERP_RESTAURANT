import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { FolderPlus, Pencil, Trash2 } from 'lucide-react';
import * as categoriasService from '../services/categorias.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Input } from '../components/ui/Input';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { mensajeError } from '../utils/errores';
import type { ActualizarCategoriaInput, CrearCategoriaInput } from '../services/categorias.service';
import type { Categoria } from '../types/api';

export function Categorias() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [categoriaEditando, setCategoriaEditando] = useState<Categoria | null>(null);
  const [categoriaEliminando, setCategoriaEliminando] = useState<Categoria | null>(null);

  const categoriasQuery = useQuery({
    queryKey: ['categorias'],
    queryFn: categoriasService.listarCategorias,
  });

  const crearForm = useForm<CrearCategoriaInput>();
  const editarForm = useForm<ActualizarCategoriaInput>();

  const crearMutation = useMutation({
    mutationFn: categoriasService.crearCategoria,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarCategoriaInput) =>
      categoriasService.actualizarCategoria(categoriaEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setCategoriaEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => categoriasService.eliminarCategoria(categoriaEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      setCategoriaEliminando(null);
    },
  });

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setCategoriaEditando(null);
    editarMutation.reset();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Categorías</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Categorías de la carta para organizar los productos
          </p>
        </div>
        {tienePermiso('categorias.crear') && (
          <Button icono={<FolderPlus className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nueva categoría
          </Button>
        )}
      </div>

      <Table
        columnas={[
          { encabezado: 'Nombre', render: (c) => c.nombre },
          { encabezado: 'Descripción', render: (c) => c.descripcion ?? '—' },
          {
            encabezado: 'Estado',
            render: (c) => (
              <Badge tono={c.activo ? 'exito' : 'neutral'}>
                {c.activo ? 'Activa' : 'Inactiva'}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (c) => (
              <div className="flex items-center gap-3">
                {tienePermiso('categorias.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setCategoriaEditando(c);
                      editarForm.reset({
                        nombre: c.nombre,
                        descripcion: c.descripcion ?? '',
                        activo: c.activo,
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('categorias.eliminar') && (
                  <button
                    type="button"
                    onClick={() => setCategoriaEliminando(c)}
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
        filas={categoriasQuery.data ?? []}
        claveFila={(c) => c.id}
        vacio="No hay categorías registradas"
        cargando={categoriasQuery.isLoading}
        error={
          categoriasQuery.isError
            ? mensajeError(categoriasQuery.error, 'No se pudieron cargar las categorías')
            : undefined
        }
        onReintentar={() => void categoriasQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nueva categoría" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear la categoría')}
            />
          )}

          <Input
            label="Nombre"
            autoFocus
            error={crearForm.formState.errors.nombre?.message}
            {...crearForm.register('nombre', { required: 'El nombre es obligatorio' })}
          />

          <Input
            label="Descripción"
            ayuda="Opcional. Ayuda a identificar qué productos agrupa la categoría."
            error={crearForm.formState.errors.descripcion?.message}
            {...crearForm.register('descripcion')}
          />

          <FormActions
            enviar="Crear categoría"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={categoriaEditando !== null} titulo="Editar categoría" onCerrar={cerrarEditar}>
        {categoriaEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar la categoría')}
              />
            )}

            <Input
              label="Nombre"
              error={editarForm.formState.errors.nombre?.message}
              {...editarForm.register('nombre', { required: 'El nombre es obligatorio' })}
            />

            <Input
              label="Descripción"
              ayuda="Opcional. Ayuda a identificar qué productos agrupa la categoría."
              error={editarForm.formState.errors.descripcion?.message}
              {...editarForm.register('descripcion')}
            />

            <Checkbox
              label="Categoría activa"
              ayuda="Las categorías inactivas no aparecen en la carta."
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
        abierto={categoriaEliminando !== null}
        titulo="Eliminar categoría"
        mensaje={`¿Seguro que deseas eliminar la categoría "${categoriaEliminando?.nombre}"? Esta acción no se puede deshacer.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setCategoriaEliminando(null)}
      />
    </div>
  );
}
