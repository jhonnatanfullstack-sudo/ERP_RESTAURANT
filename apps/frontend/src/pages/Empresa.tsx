import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Pencil } from 'lucide-react';
import * as empresaService from '../services/empresa.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Checkbox } from '../components/ui/Checkbox';
import { Badge } from '../components/ui/Badge';
import type { ActualizarEmpresaInput } from '../services/empresa.service';
import type { Empresa as EmpresaType } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Empresa</h1>
        <p className="mt-1 text-sm text-zinc-500">Datos legales y de contacto del restaurante</p>
      </div>

      <Table
        columnas={[
          { encabezado: 'RUC', render: (e) => e.ruc },
          { encabezado: 'Razón social', render: (e) => e.razonSocial },
          { encabezado: 'Nombre comercial', render: (e) => e.nombreComercial ?? '—' },
          {
            encabezado: 'IGV',
            render: (e) =>
              e.acogidoRegimenMypeRestaurantes ? (
                <Badge tono="exito">MYPE 10.5%</Badge>
              ) : (
                <Badge tono="neutral">General 18%</Badge>
              ),
          },
          {
            encabezado: '',
            render: (e) =>
              tienePermiso('empresa.editar') && (
                <button
                  type="button"
                  onClick={() => setEmpresaEditando(e)}
                  className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
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
              <label className={labelClass}>Razón social</label>
              <input
                defaultValue={empresaEditando.razonSocial}
                {...register('razonSocial', { required: true })}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Nombre comercial</label>
              <input
                defaultValue={empresaEditando.nombreComercial ?? ''}
                {...register('nombreComercial')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Dirección fiscal</label>
              <input
                defaultValue={empresaEditando.direccionFiscal ?? ''}
                {...register('direccionFiscal')}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Teléfono</label>
                <input
                  defaultValue={empresaEditando.telefono ?? ''}
                  {...register('telefono')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Correo</label>
                <input
                  defaultValue={empresaEditando.email ?? ''}
                  {...register('email')}
                  className={inputClass}
                />
              </div>
            </div>

            <Checkbox
              label="Acogida al régimen MYPE de restaurantes (IGV 10.5%)"
              ayuda="Solo si el negocio ya se acogió ante SUNAT (Formulario Virtual 621) al régimen especial de MYPE de restaurantes/hoteles — no es automático. Sin marcar, las ventas usan la tasa general de 18%."
              defaultChecked={empresaEditando.acogidoRegimenMypeRestaurantes}
              {...register('acogidoRegimenMypeRestaurantes')}
            />

            <Button
              type="submit"
              disabled={formState.isSubmitting || actualizarMutation.isPending}
              className="mt-2 w-full"
            >
              Guardar cambios
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
