import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import * as empresaService from '../services/empresa.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import type { ActualizarEmpresaInput } from '../services/empresa.service';
import type { Empresa as EmpresaType } from '../types/api';

export function Empresa() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [empresaEditando, setEmpresaEditando] = useState<EmpresaType | null>(null);

  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: empresaService.listarEmpresas,
  });

  const { register, handleSubmit, formState } = useForm<ActualizarEmpresaInput>();

  const actualizarMutation = useMutation({
    mutationFn: (values: ActualizarEmpresaInput) =>
      empresaService.actualizarEmpresa(empresaEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      setEmpresaEditando(null);
    },
  });

  if (empresasQuery.isLoading) return <Spinner />;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Empresa</h1>

      <Table
        columnas={[
          { encabezado: 'RUC', render: (e) => e.ruc },
          { encabezado: 'Razón social', render: (e) => e.razonSocial },
          { encabezado: 'Nombre comercial', render: (e) => e.nombreComercial ?? '—' },
          {
            encabezado: '',
            render: (e) =>
              tienePermiso('empresa.editar') && (
                <button
                  type="button"
                  onClick={() => setEmpresaEditando(e)}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  Editar
                </button>
              ),
          },
        ]}
        filas={empresasQuery.data ?? []}
        claveFila={(e) => e.id}
      />

      <Modal
        abierto={empresaEditando !== null}
        titulo="Editar empresa"
        onCerrar={() => setEmpresaEditando(null)}
      >
        {empresaEditando && (
          <form
            onSubmit={handleSubmit((values) => actualizarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {actualizarMutation.isError && (
              <Alert tipo="error" mensaje="No se pudo actualizar la empresa" />
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Razón social</label>
              <input
                defaultValue={empresaEditando.razonSocial}
                {...register('razonSocial', { required: true })}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nombre comercial
              </label>
              <input
                defaultValue={empresaEditando.nombreComercial ?? ''}
                {...register('nombreComercial')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Dirección fiscal
              </label>
              <input
                defaultValue={empresaEditando.direccionFiscal ?? ''}
                {...register('direccionFiscal')}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Teléfono</label>
                <input
                  defaultValue={empresaEditando.telefono ?? ''}
                  {...register('telefono')}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Correo</label>
                <input
                  defaultValue={empresaEditando.email ?? ''}
                  {...register('email')}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={formState.isSubmitting || actualizarMutation.isPending}
              className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Guardar cambios
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
