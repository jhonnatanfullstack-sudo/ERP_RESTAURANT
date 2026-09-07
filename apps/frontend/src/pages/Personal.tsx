import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { UserPlus } from 'lucide-react';
import * as personalService from '../services/personal.service';
import * as empresaService from '../services/empresa.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import type { CrearPersonalInput } from '../services/personal.service';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

export function Personal() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);

  const personalQuery = useQuery({
    queryKey: ['personal'],
    queryFn: personalService.listarPersonal,
  });
  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: empresaService.listarEmpresas,
  });
  const tiposDocQuery = useQuery({
    queryKey: ['tipos-documento-identidad'],
    queryFn: catalogosService.listarTiposDocumentoIdentidad,
  });

  const { register, handleSubmit, reset, formState } = useForm<CrearPersonalInput>();

  const crearMutation = useMutation({
    mutationFn: personalService.crearPersonal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal'] });
      setModalAbierto(false);
      reset();
    },
  });

  if (personalQuery.isLoading) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Personal</h1>
          <p className="mt-1 text-sm text-zinc-500">Personas físicas vinculadas a la empresa</p>
        </div>
        {tienePermiso('personal.crear') && (
          <Button icono={<UserPlus className="h-4 w-4" />} onClick={() => setModalAbierto(true)}>
            Nuevo personal
          </Button>
        )}
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Nombre completo',
            render: (p) =>
              `${p.nombres} ${p.apellidoPaterno ?? ''} ${p.apellidoMaterno ?? ''}`.trim(),
          },
          {
            encabezado: 'Documento',
            render: (p) => `${p.tipoDocumentoIdentidad.nombre}: ${p.numeroDocumento}`,
          },
          { encabezado: 'Empresa', render: (p) => p.empresa.razonSocial },
          {
            encabezado: 'Estado',
            render: (p) => (
              <Badge tono={p.activo ? 'exito' : 'neutral'}>
                {p.activo ? 'Activo' : 'Inactivo'}
              </Badge>
            ),
          },
        ]}
        filas={personalQuery.data ?? []}
        claveFila={(p) => p.id}
        vacio="No hay personal registrado"
      />

      <Modal abierto={modalAbierto} titulo="Nuevo personal" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={
                (crearMutation.error as { response?: { data?: { message?: string } } })?.response
                  ?.data?.message ?? 'No se pudo crear el registro'
              }
            />
          )}

          <div>
            <label className={labelClass}>Empresa</label>
            <select {...register('empresaId', { required: true })} className={inputClass}>
              <option value="">Seleccionar…</option>
              {empresasQuery.data?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.razonSocial}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Tipo de documento</label>
              <select
                {...register('tipoDocumentoIdentidadId', { required: true })}
                className={inputClass}
              >
                <option value="">Seleccionar…</option>
                {tiposDocQuery.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>N° de documento</label>
              <input {...register('numeroDocumento', { required: true })} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Nombres</label>
            <input {...register('nombres', { required: true })} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Apellido paterno</label>
              <input {...register('apellidoPaterno')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Apellido materno</label>
              <input {...register('apellidoMaterno')} className={inputClass} />
            </div>
          </div>

          <Button
            type="submit"
            disabled={formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear personal
          </Button>
        </form>
      </Modal>
    </div>
  );
}
