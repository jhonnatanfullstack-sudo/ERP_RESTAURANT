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
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CampoBusquedaDocumento } from '../components/CampoBusquedaDocumento';
import { CamposIdentidadCliente } from '../components/CamposIdentidadCliente';
import { ClienteCrearModal } from '../components/ClienteCrearModal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { nombreCliente } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import { vacioANull } from '../utils/formulario';
import type { ActualizarClienteInput } from '../services/clientes.service';
import type { Cliente } from '../types/api';

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

  const editarForm = useForm<ActualizarClienteInput>();

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarClienteInput) =>
      clientesService.actualizarCliente(clienteEditando!.id, {
        ...values,
        nombres: vacioANull(values.nombres),
        apellidos: vacioANull(values.apellidos),
        razonSocial: vacioANull(values.razonSocial),
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

  function cerrarEditar() {
    setClienteEditando(null);
    editarMutation.reset();
  }

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
          { encabezado: 'Nombre / razón social', render: (c) => nombreCliente(c) },
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
                        nombres: c.nombres ?? '',
                        apellidos: c.apellidos ?? '',
                        razonSocial: c.razonSocial ?? '',
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
        cargando={clientesQuery.isLoading}
        error={
          clientesQuery.isError
            ? mensajeError(clientesQuery.error, 'No se pudieron cargar los clientes')
            : undefined
        }
        onReintentar={() => void clientesQuery.refetch()}
      />

      <ClienteCrearModal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onCreado={() => setModalAbierto(false)}
      />

      <Modal abierto={clienteEditando !== null} titulo="Editar cliente" onCerrar={cerrarEditar}>
        {clienteEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el cliente')}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Tipo de documento"
                error={editarForm.formState.errors.tipoDocumentoIdentidadId?.message}
                {...editarForm.register('tipoDocumentoIdentidadId')}
              >
                <option value="">Sin documento</option>
                {tiposDocQuery.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </Select>
              <CampoBusquedaDocumento
                control={editarForm.control}
                tipos={tiposDocQuery.data}
                register={editarForm.register}
                getValues={editarForm.getValues}
                campoTipo="tipoDocumentoIdentidadId"
                campoNumero="numeroDocumento"
                consultar={clientesService.consultarDocumento}
                onEncontrado={(datos) => {
                  if (datos.razonSocial) {
                    editarForm.setValue('razonSocial', datos.razonSocial, {
                      shouldValidate: true,
                    });
                  } else {
                    editarForm.setValue('nombres', datos.nombres ?? '', { shouldValidate: true });
                    const apellidos = [datos.apellidoPaterno, datos.apellidoMaterno]
                      .filter(Boolean)
                      .join(' ');
                    if (apellidos) editarForm.setValue('apellidos', apellidos);
                  }
                }}
              />
            </div>

            <CamposIdentidadCliente
              control={editarForm.control}
              register={editarForm.register}
              tipos={tiposDocQuery.data}
              campoTipo="tipoDocumentoIdentidadId"
              campoNumero="numeroDocumento"
              campoNombres="nombres"
              campoApellidos="apellidos"
              campoRazonSocial="razonSocial"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Teléfono"
                error={editarForm.formState.errors.telefono?.message}
                {...editarForm.register('telefono')}
              />
              <Input
                label="Correo electrónico"
                type="email"
                error={editarForm.formState.errors.email?.message}
                {...editarForm.register('email')}
              />
            </div>

            <Input
              label="Dirección"
              error={editarForm.formState.errors.direccion?.message}
              {...editarForm.register('direccion')}
            />

            <Checkbox
              label="Cliente activo"
              ayuda="Los clientes inactivos conservan su historial pero no se pueden usar en nuevos pedidos."
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
        abierto={clienteEliminando !== null}
        titulo="Desactivar cliente"
        mensaje={`¿Seguro que deseas desactivar a "${nombreCliente(clienteEliminando)}"? Su historial se conserva, pero quedará marcado como inactivo.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setClienteEliminando(null)}
      />
    </div>
  );
}
