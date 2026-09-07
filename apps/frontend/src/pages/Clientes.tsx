import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import * as clientesService from '../services/clientes.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CampoBusquedaDocumento } from '../components/CampoBusquedaDocumento';
import type { ActualizarClienteInput, CrearClienteInput } from '../services/clientes.service';
import type { Cliente } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

function vacioANull(valor?: string | null): string | null | undefined {
  return valor === '' ? null : valor;
}

export function Clientes() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [clienteEliminando, setClienteEliminando] = useState<Cliente | null>(null);

  const clientesQuery = useQuery({
    queryKey: ['clientes'],
    queryFn: clientesService.listarClientes,
  });
  const tiposDocQuery = useQuery({
    queryKey: ['tipos-documento-identidad'],
    queryFn: catalogosService.listarTiposDocumentoIdentidad,
  });

  const crearForm = useForm<CrearClienteInput>();
  const editarForm = useForm<ActualizarClienteInput>();

  const crearMutation = useMutation({
    mutationFn: (values: CrearClienteInput) =>
      clientesService.crearCliente({
        ...values,
        apellidos: vacioANull(values.apellidos),
        tipoDocumentoIdentidadId: vacioANull(values.tipoDocumentoIdentidadId),
        numeroDocumento: vacioANull(values.numeroDocumento),
        telefono: vacioANull(values.telefono),
        email: vacioANull(values.email),
        direccion: vacioANull(values.direccion),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarClienteInput) =>
      clientesService.actualizarCliente(clienteEditando!.id, {
        ...values,
        apellidos: vacioANull(values.apellidos),
        tipoDocumentoIdentidadId: vacioANull(values.tipoDocumentoIdentidadId),
        numeroDocumento: vacioANull(values.numeroDocumento),
        telefono: vacioANull(values.telefono),
        email: vacioANull(values.email),
        direccion: vacioANull(values.direccion),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setClienteEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => clientesService.eliminarCliente(clienteEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setClienteEliminando(null);
    },
  });

  if (clientesQuery.isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">Registro de clientes del restaurante</p>
        </div>
        {tienePermiso('clientes.crear') && (
          <Button icono={<UserPlus className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nuevo cliente
          </Button>
        )}
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Nombre completo',
            render: (c) => `${c.nombres} ${c.apellidos ?? ''}`.trim(),
          },
          {
            encabezado: 'Documento',
            render: (c) =>
              c.numeroDocumento
                ? `${c.tipoDocumentoIdentidad?.nombre ?? ''}: ${c.numeroDocumento}`.trim()
                : '—',
          },
          { encabezado: 'Teléfono', render: (c) => c.telefono ?? '—' },
          { encabezado: 'Correo', render: (c) => c.email ?? '—' },
          {
            encabezado: 'Estado',
            render: (c) => (
              <Badge tono={c.activo ? 'exito' : 'neutral'}>
                {c.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (c) => (
              <div className="flex items-center gap-3">
                {tienePermiso('clientes.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setClienteEditando(c);
                      editarForm.reset({
                        nombres: c.nombres,
                        apellidos: c.apellidos ?? '',
                        tipoDocumentoIdentidadId: c.tipoDocumentoIdentidad?.id ?? '',
                        numeroDocumento: c.numeroDocumento ?? '',
                        telefono: c.telefono ?? '',
                        email: c.email ?? '',
                        direccion: c.direccion ?? '',
                        activo: c.activo,
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('clientes.eliminar') && c.activo && (
                  <button
                    type="button"
                    onClick={() => setClienteEliminando(c)}
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
        filas={clientesQuery.data ?? []}
        claveFila={(c) => c.id}
        vacio="No hay clientes registrados"
      />

      <Modal abierto={modalAbierto} titulo="Nuevo cliente" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el cliente')}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nombres</label>
              <input
                {...crearForm.register('nombres', { required: true })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Apellidos</label>
              <input {...crearForm.register('apellidos')} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tipo de documento</label>
              <select {...crearForm.register('tipoDocumentoIdentidadId')} className={inputClass}>
                <option value="">Sin documento</option>
                {tiposDocQuery.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
            <CampoBusquedaDocumento
              control={crearForm.control}
              tipos={tiposDocQuery.data}
              register={crearForm.register}
              getValues={crearForm.getValues}
              campoTipo="tipoDocumentoIdentidadId"
              campoNumero="numeroDocumento"
              consultar={clientesService.consultarDocumento}
              onEncontrado={(datos) => {
                crearForm.setValue('nombres', datos.nombres, { shouldValidate: true });
                const apellidos = [datos.apellidoPaterno, datos.apellidoMaterno]
                  .filter(Boolean)
                  .join(' ');
                if (apellidos) crearForm.setValue('apellidos', apellidos);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Teléfono</label>
              <input {...crearForm.register('telefono')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Correo electrónico</label>
              <input type="email" {...crearForm.register('email')} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Dirección</label>
            <input {...crearForm.register('direccion')} className={inputClass} />
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear cliente
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={clienteEditando !== null}
        titulo="Editar cliente"
        onCerrar={() => setClienteEditando(null)}
      >
        {clienteEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el cliente')}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nombres</label>
                <input
                  {...editarForm.register('nombres', { required: true })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Apellidos</label>
                <input {...editarForm.register('apellidos')} className={inputClass} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Tipo de documento</label>
                <select {...editarForm.register('tipoDocumentoIdentidadId')} className={inputClass}>
                  <option value="">Sin documento</option>
                  {tiposDocQuery.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <CampoBusquedaDocumento
                control={editarForm.control}
                tipos={tiposDocQuery.data}
                register={editarForm.register}
                getValues={editarForm.getValues}
                campoTipo="tipoDocumentoIdentidadId"
                campoNumero="numeroDocumento"
                consultar={clientesService.consultarDocumento}
                onEncontrado={(datos) => {
                  editarForm.setValue('nombres', datos.nombres, { shouldValidate: true });
                  const apellidos = [datos.apellidoPaterno, datos.apellidoMaterno]
                    .filter(Boolean)
                    .join(' ');
                  if (apellidos) editarForm.setValue('apellidos', apellidos);
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Teléfono</label>
                <input {...editarForm.register('telefono')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Correo electrónico</label>
                <input type="email" {...editarForm.register('email')} className={inputClass} />
              </div>
            </div>

            <div>
              <label className={labelClass}>Dirección</label>
              <input {...editarForm.register('direccion')} className={inputClass} />
            </div>

            <label className="flex items-center gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                {...editarForm.register('activo')}
                className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
              />
              Cliente activo
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
        abierto={clienteEliminando !== null}
        titulo="Desactivar cliente"
        mensaje={`¿Seguro que deseas desactivar a "${clienteEliminando?.nombres}"? Su historial se conserva, pero quedará marcado como inactivo.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setClienteEliminando(null)}
      />
    </div>
  );
}
