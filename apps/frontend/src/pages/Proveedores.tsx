import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil, Trash2, Truck } from 'lucide-react';
import * as proveedoresService from '../services/proveedores.service';
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
import { ProveedorCrearModal } from '../components/ProveedorCrearModal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { nombreCliente } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import { vacioANull } from '../utils/formulario';
import type { ActualizarProveedorInput } from '../services/proveedores.service';
import type { Proveedor } from '../types/api';

export function Proveedores() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [proveedorEditando, setProveedorEditando] = useState<Proveedor | null>(null);
  const [proveedorEliminando, setProveedorEliminando] = useState<Proveedor | null>(null);

  const proveedoresQuery = useQuery({
    queryKey: ['proveedores'],
    queryFn: proveedoresService.listarProveedores,
  });
  const tiposDocQuery = useQuery({
    queryKey: ['tipos-documento-identidad'],
    queryFn: catalogosService.listarTiposDocumentoIdentidad,
  });

  const editarForm = useForm<ActualizarProveedorInput>();

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarProveedorInput) =>
      proveedoresService.actualizarProveedor(proveedorEditando!.id, {
        ...values,
        nombres: vacioANull(values.nombres),
        apellidos: vacioANull(values.apellidos),
        razonSocial: vacioANull(values.razonSocial),
        telefono: vacioANull(values.telefono),
        email: vacioANull(values.email),
        direccion: vacioANull(values.direccion),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      setProveedorEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => proveedoresService.eliminarProveedor(proveedorEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      setProveedorEliminando(null);
    },
  });

  function cerrarEditar() {
    setProveedorEditando(null);
    editarMutation.reset();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Proveedores</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Registro de proveedores para las compras de insumos y mercadería
          </p>
        </div>
        {tienePermiso('proveedores.crear') && (
          <Button icono={<Truck className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nuevo proveedor
          </Button>
        )}
      </div>

      <Table
        columnas={[
          { encabezado: 'Nombre / razón social', render: (p) => nombreCliente(p) },
          {
            encabezado: 'Documento',
            render: (p) => `${p.tipoDocumentoIdentidad.nombre}: ${p.numeroDocumento}`,
          },
          { encabezado: 'Teléfono', render: (p) => p.telefono ?? '—' },
          { encabezado: 'Correo', render: (p) => p.email ?? '—' },
          {
            encabezado: 'Estado',
            render: (p) => (
              <Badge tono={p.activo ? 'exito' : 'neutral'}>
                {p.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
          {
            encabezado: '',
            render: (p) => (
              <div className="flex items-center gap-3">
                {tienePermiso('proveedores.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setProveedorEditando(p);
                      editarForm.reset({
                        nombres: p.nombres ?? '',
                        apellidos: p.apellidos ?? '',
                        razonSocial: p.razonSocial ?? '',
                        tipoDocumentoIdentidadId: p.tipoDocumentoIdentidad.id,
                        numeroDocumento: p.numeroDocumento,
                        telefono: p.telefono ?? '',
                        email: p.email ?? '',
                        direccion: p.direccion ?? '',
                        activo: p.activo,
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('proveedores.eliminar') && p.activo && (
                  <button
                    type="button"
                    onClick={() => setProveedorEliminando(p)}
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
        filas={proveedoresQuery.data ?? []}
        claveFila={(p) => p.id}
        vacio="No hay proveedores registrados"
        cargando={proveedoresQuery.isLoading}
        error={
          proveedoresQuery.isError
            ? mensajeError(proveedoresQuery.error, 'No se pudieron cargar los proveedores')
            : undefined
        }
        onReintentar={() => void proveedoresQuery.refetch()}
      />

      <ProveedorCrearModal
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onCreado={() => setModalAbierto(false)}
      />

      <Modal abierto={proveedorEditando !== null} titulo="Editar proveedor" onCerrar={cerrarEditar}>
        {proveedorEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el proveedor')}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Tipo de documento"
                error={editarForm.formState.errors.tipoDocumentoIdentidadId?.message}
                {...editarForm.register('tipoDocumentoIdentidadId', {
                  required: 'Selecciona el tipo de documento',
                })}
              >
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
                requerido
                consultar={proveedoresService.consultarDocumento}
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
              label="Proveedor activo"
              ayuda="Un proveedor inactivo no se puede elegir en nuevas compras."
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
        abierto={proveedorEliminando !== null}
        titulo="Desactivar proveedor"
        mensaje={`¿Seguro que deseas desactivar a "${nombreCliente(proveedorEliminando)}"? Su historial de compras se conserva, pero quedará marcado como inactivo.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setProveedorEliminando(null)}
      />
    </div>
  );
}
