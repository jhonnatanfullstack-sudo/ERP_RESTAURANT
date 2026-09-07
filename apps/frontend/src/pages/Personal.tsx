import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import * as personalService from '../services/personal.service';
import * as empresaService from '../services/empresa.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import type { CrearPersonalInput } from '../services/personal.service';

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
        <h1 className="text-2xl font-semibold text-slate-900">Personal</h1>
        {tienePermiso('personal.crear') && (
          <button
            type="button"
            onClick={() => setModalAbierto(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Nuevo personal
          </button>
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
          { encabezado: 'Estado', render: (p) => (p.activo ? 'Activo' : 'Inactivo') },
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Empresa</label>
            <select
              {...register('empresaId', { required: true })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
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
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Tipo de documento
              </label>
              <select
                {...register('tipoDocumentoIdentidadId', { required: true })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
              <label className="mb-1 block text-sm font-medium text-slate-700">
                N° de documento
              </label>
              <input
                {...register('numeroDocumento', { required: true })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombres</label>
            <input
              {...register('nombres', { required: true })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Apellido paterno
              </label>
              <input
                {...register('apellidoPaterno')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Apellido materno
              </label>
              <input
                {...register('apellidoMaterno')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={formState.isSubmitting || crearMutation.isPending}
            className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Crear personal
          </button>
        </form>
      </Modal>
    </div>
  );
}
