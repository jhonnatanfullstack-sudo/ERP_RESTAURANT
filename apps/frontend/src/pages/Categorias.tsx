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
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { ActualizarCategoriaInput, CrearCategoriaInput } from '../services/categorias.service';
import type { Categoria } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

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

  if (categoriasQuery.isLoading) return <Spinner />;

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
      />

      <Modal
        abierto={modalAbierto}
        titulo="Nueva categoría"
        onCerrar={() => setModalAbierto(false)}
      >
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear la categoría')}
            />
          )}

          <div>
            <label className={labelClass}>Nombre</label>
            <input {...crearForm.register('nombre', { required: true })} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Descripción</label>
            <input {...crearForm.register('descripcion')} className={inputClass} />
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear categoría
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={categoriaEditando !== null}
        titulo="Editar categoría"
        onCerrar={() => setCategoriaEditando(null)}
      >
        {categoriaEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar la categoría')}
              />
            )}

            <div>
              <label className={labelClass}>Nombre</label>
              <input
                {...editarForm.register('nombre', { required: true })}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Descripción</label>
              <input {...editarForm.register('descripcion')} className={inputClass} />
            </div>

            <label className="flex items-center gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                {...editarForm.register('activo')}
                className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
              />
              Categoría activa
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
