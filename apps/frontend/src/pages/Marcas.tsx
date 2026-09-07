import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, Tags, Trash2 } from 'lucide-react';
import * as marcasService from '../services/marcas.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import type { ActualizarMarcaInput, CrearMarcaInput } from '../services/marcas.service';
import type { Marca } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

export function Marcas() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [marcaEditando, setMarcaEditando] = useState<Marca | null>(null);
  const [marcaEliminando, setMarcaEliminando] = useState<Marca | null>(null);

  const marcasQuery = useQuery({ queryKey: ['marcas'], queryFn: marcasService.listarMarcas });

  const crearForm = useForm<CrearMarcaInput>();
  const editarForm = useForm<ActualizarMarcaInput>();

  const crearMutation = useMutation({
    mutationFn: marcasService.crearMarca,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marcas'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarMarcaInput) =>
      marcasService.actualizarMarca(marcaEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marcas'] });
      setMarcaEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => marcasService.eliminarMarca(marcaEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marcas'] });
      setMarcaEliminando(null);
    },
  });

  if (marcasQuery.isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Marcas</h1>
          <p className="mt-1 text-sm text-zinc-500">Marcas de los productos de la carta</p>
        </div>
        {tienePermiso('marcas.crear') && (
          <Button icono={<Tags className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nueva marca
          </Button>
        )}
      </div>

      <Table
        columnas={[
          { encabezado: 'Nombre', render: (m) => m.nombre },
          { encabezado: 'Descripción', render: (m) => m.descripcion ?? '—' },
          {
            encabezado: 'Estado',
            render: (m) => (
              <Badge tono={m.activo ? 'exito' : 'neutral'}>
                {m.activo ? 'Activa' : 'Inactiva'}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (m) => (
              <div className="flex items-center gap-3">
                {tienePermiso('marcas.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setMarcaEditando(m);
                      editarForm.reset({
                        nombre: m.nombre,
                        descripcion: m.descripcion ?? '',
                        activo: m.activo,
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('marcas.eliminar') && (
                  <button
                    type="button"
                    onClick={() => setMarcaEliminando(m)}
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
        filas={marcasQuery.data ?? []}
        claveFila={(m) => m.id}
        vacio="No hay marcas registradas"
      />

      <Modal abierto={modalAbierto} titulo="Nueva marca" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear la marca')}
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
            Crear marca
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={marcaEditando !== null}
        titulo="Editar marca"
        onCerrar={() => setMarcaEditando(null)}
      >
        {marcaEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar la marca')}
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
              Marca activa
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
        abierto={marcaEliminando !== null}
        titulo="Eliminar marca"
        mensaje={`¿Seguro que deseas eliminar la marca "${marcaEliminando?.nombre}"? Esta acción no se puede deshacer.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setMarcaEliminando(null)}
      />
    </div>
  );
}
