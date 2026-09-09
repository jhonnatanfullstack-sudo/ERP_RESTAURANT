import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import * as clientesService from '../services/clientes.service';
import * as catalogosService from '../services/catalogos.service';
import { Modal } from './ui/Modal';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { CampoBusquedaDocumento } from './CampoBusquedaDocumento';
import { CamposIdentidadCliente } from './CamposIdentidadCliente';
import type { CrearClienteInput } from '../services/clientes.service';
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
      >
        {crearMutation.isError && (
          <Alert
            tipo="error"
            mensaje={mensajeError(crearMutation.error, 'No se pudo crear el cliente')}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Tipo de documento</label>
            <select {...form.register('tipoDocumentoIdentidadId')} className={inputClass}>
              <option value="">Sin documento</option>
              {tiposDocQuery.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Teléfono</label>
            <input {...form.register('telefono')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Correo electrónico</label>
            <input type="email" {...form.register('email')} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Dirección</label>
          <input {...form.register('direccion')} className={inputClass} />
        </div>

        <Button
          type="submit"
          disabled={form.formState.isSubmitting || crearMutation.isPending}
          className="mt-2 w-full"
        >
          Crear cliente
        </Button>
      </form>
    </Modal>
  );
}
