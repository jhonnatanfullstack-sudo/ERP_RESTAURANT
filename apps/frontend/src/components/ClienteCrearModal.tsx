import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import * as clientesService from '../services/clientes.service';
import * as catalogosService from '../services/catalogos.service';
import { Modal } from './ui/Modal';
import { Alert } from './ui/Alert';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { FormActions } from './ui/FormActions';
import { CampoBusquedaDocumento } from './CampoBusquedaDocumento';
import { CamposIdentidadCliente } from './CamposIdentidadCliente';
import { mensajeError } from '../utils/errores';
import { vacioANull } from '../utils/formulario';
import type { CrearClienteInput } from '../services/clientes.service';
import type { Cliente } from '../types/api';

interface ClienteCrearModalProps {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: (cliente: Cliente) => void;
  /** Prellenar el formulario (ej. desde una búsqueda por documento que no encontró coincidencia). */
  valoresIniciales?: Partial<CrearClienteInput>;
}

/** Modal de "crear cliente" reutilizable — usado por la página Clientes y por el buscador de
 * cliente embebido en Pedidos/Ventas (botón "+ Nuevo cliente" cuando la búsqueda no encuentra
 * a nadie). No duplicar este formulario en otro lugar. */
export function ClienteCrearModal({
  abierto,
  onCerrar,
  onCreado,
  valoresIniciales,
}: ClienteCrearModalProps) {
  const queryClient = useQueryClient();
  const tiposDocQuery = useQuery({
    queryKey: ['tipos-documento-identidad'],
    queryFn: catalogosService.listarTiposDocumentoIdentidad,
  });

  const form = useForm<CrearClienteInput>({ defaultValues: valoresIniciales });

  useEffect(() => {
    if (abierto) form.reset(valoresIniciales);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir, no en cada tecla
  }, [abierto]);

  const crearMutation = useMutation({
    mutationFn: (values: CrearClienteInput) =>
      clientesService.crearCliente({
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
    onSuccess: (cliente) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      form.reset();
      onCreado(cliente);
    },
  });

  return (
    <Modal abierto={abierto} titulo="Nuevo cliente" onCerrar={onCerrar}>
      <form
        onSubmit={form.handleSubmit((values) => crearMutation.mutate(values))}
        className="flex flex-col gap-4"
        noValidate
      >
        {crearMutation.isError && (
          <Alert
            tipo="error"
            mensaje={mensajeError(crearMutation.error, 'No se pudo crear el cliente')}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Tipo de documento"
            error={form.formState.errors.tipoDocumentoIdentidadId?.message}
            {...form.register('tipoDocumentoIdentidadId')}
          >
            <option value="">Sin documento</option>
            {tiposDocQuery.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Select>
          <CampoBusquedaDocumento
            control={form.control}
            tipos={tiposDocQuery.data}
            register={form.register}
            getValues={form.getValues}
            campoTipo="tipoDocumentoIdentidadId"
            campoNumero="numeroDocumento"
            consultar={clientesService.consultarDocumento}
            onEncontrado={(datos) => {
              if (datos.razonSocial) {
                form.setValue('razonSocial', datos.razonSocial, { shouldValidate: true });
              } else {
                form.setValue('nombres', datos.nombres ?? '', { shouldValidate: true });
                const apellidos = [datos.apellidoPaterno, datos.apellidoMaterno]
                  .filter(Boolean)
                  .join(' ');
                if (apellidos) form.setValue('apellidos', apellidos);
              }
            }}
          />
        </div>

        <CamposIdentidadCliente
          control={form.control}
          register={form.register}
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
            error={form.formState.errors.telefono?.message}
            {...form.register('telefono')}
          />
          <Input
            label="Correo electrónico"
            type="email"
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
        </div>

        <Input
          label="Dirección"
          error={form.formState.errors.direccion?.message}
          {...form.register('direccion')}
        />

        <FormActions
          enviar="Crear cliente"
          enviandoTexto="Creando…"
          onCancelar={onCerrar}
          enviando={form.formState.isSubmitting || crearMutation.isPending}
        />
      </form>
    </Modal>
  );
}
