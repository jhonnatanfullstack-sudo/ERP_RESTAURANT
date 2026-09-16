import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Check, Copy, ExternalLink, Pencil, QrCode } from 'lucide-react';
import * as empresaService from '../services/empresa.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Input } from '../components/ui/Input';
import { Checkbox } from '../components/ui/Checkbox';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Panel } from '../components/ui/Panel';
import { FormActions } from '../components/ui/FormActions';
import { SelectorGeografico } from '../components/SelectorGeografico';
import { mensajeError } from '../utils/errores';
import type { ActualizarEmpresaInput } from '../services/empresa.service';
import type { Empresa as EmpresaType } from '../types/api';

export function Empresa() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [empresaEditando, setEmpresaEditando] = useState<EmpresaType | null>(null);
  const [copiado, setCopiado] = useState(false);

  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: empresaService.listarEmpresas,
  });
  const empresa = empresasQuery.data?.[0];
  const urlCarta = empresa ? `${window.location.origin}/carta/${empresa.slug}` : null;

  const { register, handleSubmit, formState, control, setValue } =
    useForm<ActualizarEmpresaInput>();

  const actualizarMutation = useMutation({
    mutationFn: (values: ActualizarEmpresaInput) =>
      empresaService.actualizarEmpresa(empresaEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      setEmpresaEditando(null);
    },
  });

  function cerrarEditar() {
    setEmpresaEditando(null);
    actualizarMutation.reset();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Empresa</h1>
        <p className="mt-1 text-sm text-zinc-500">Datos legales y de contacto del restaurante</p>
      </div>

      {urlCarta && (
        <Panel
          titulo="Tu carta pública"
          descripcion="El enlace que le compartes a tus clientes — el mismo que llevan los QR de tus mesas"
          icono={QrCode}
          className="mb-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {urlCarta}
            </code>
            <Button
              type="button"
              variante="secondary"
              icono={copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              onClick={() => {
                void navigator.clipboard.writeText(urlCarta).then(() => {
                  setCopiado(true);
                  window.setTimeout(() => setCopiado(false), 1500);
                });
              }}
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </Button>
            <a
              href={urlCarta}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir
            </a>
          </div>
        </Panel>
      )}

      <Table
        columnas={[
          { encabezado: 'RUC', render: (e) => e.ruc },
          { encabezado: 'Razón social', render: (e) => e.razonSocial },
          { encabezado: 'Nombre comercial', render: (e) => e.nombreComercial ?? '—' },
          { encabezado: 'Dirección fiscal', render: (e) => e.direccionFiscal ?? '—' },
          { encabezado: 'Teléfono', render: (e) => e.telefono ?? '—' },
          { encabezado: 'Email', render: (e) => e.email ?? '—' },
          { encabezado: 'Logo', render: (e) => e.logo ?? '—' },
          { encabezado: 'Ubigeo', render: (e) => e.ubigeo ?? '—' },
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
        cargando={empresasQuery.isLoading}
        error={
          empresasQuery.isError
            ? mensajeError(empresasQuery.error, 'No se pudieron cargar los datos de la empresa')
            : undefined
        }
        onReintentar={() => void empresasQuery.refetch()}
      />

      <Modal abierto={empresaEditando !== null} titulo="Editar empresa" onCerrar={cerrarEditar}>
        {empresaEditando && (
          <form
            onSubmit={handleSubmit((values) => actualizarMutation.mutate(values))}
            className="flex flex-col gap-4"
            noValidate
          >
            {actualizarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(actualizarMutation.error, 'No se pudo actualizar la empresa')}
              />
            )}

            <Input
              label="Razón social"
              defaultValue={empresaEditando.razonSocial}
              error={formState.errors.razonSocial?.message}
              {...register('razonSocial', { required: 'La razón social es obligatoria' })}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nombre comercial"
                ayuda="Opcional. El nombre con el que se conoce al local."
                defaultValue={empresaEditando.nombreComercial ?? ''}
                error={formState.errors.nombreComercial?.message}
                {...register('nombreComercial')}
              />
              <Input
                label="Dirección fiscal"
                defaultValue={empresaEditando.direccionFiscal ?? ''}
                error={formState.errors.direccionFiscal?.message}
                {...register('direccionFiscal')}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Teléfono"
                defaultValue={empresaEditando.telefono ?? ''}
                error={formState.errors.telefono?.message}
                {...register('telefono')}
              />
              <Input
                label="Correo"
                type="email"
                defaultValue={empresaEditando.email ?? ''}
                error={formState.errors.email?.message}
                {...register('email')}
              />
            </div>

            <SelectorGeografico
              control={control}
              register={register}
              setValue={setValue}
              campoPais="paisId"
              campoDistrito="distritoId"
              paisInicial={empresaEditando.pais}
              distritoInicial={empresaEditando.distrito}
              consultarPaises={catalogosService.listarPaises}
              consultarDivisiones={catalogosService.listarDivisionesAdministrativas}
              erroresPais={formState.errors.paisId?.message}
              erroresDistrito={formState.errors.distritoId?.message}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Ubigeo"
                ayuda="Se completa solo al elegir el distrito — es lo que se envía a SUNAT."
                value={empresaEditando.ubigeo ?? ''}
                readOnly
                disabled
              />
              <Input
                label="Logo"
                ayuda="Ruta o URL de la imagen del logo."
                defaultValue={empresaEditando.logo ?? ''}
                error={formState.errors.logo?.message}
                {...register('logo')}
              />
            </div>

            <Checkbox
              label="Acogida al régimen MYPE de restaurantes (IGV 10.5%)"
              ayuda="Solo si el negocio ya se acogió ante SUNAT (Formulario Virtual 621) al régimen especial de MYPE de restaurantes/hoteles — no es automático. Sin marcar, las ventas usan la tasa general de 18%."
              defaultChecked={empresaEditando.acogidoRegimenMypeRestaurantes}
              {...register('acogidoRegimenMypeRestaurantes')}
            />

            <FormActions
              enviar="Guardar cambios"
              onCancelar={cerrarEditar}
              enviando={formState.isSubmitting || actualizarMutation.isPending}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
