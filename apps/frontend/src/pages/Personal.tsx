import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { Loader2, Pencil, Search, Trash2, UserPlus } from 'lucide-react';
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
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FORMATOS_DOCUMENTO } from '../utils/documento';
import type { ActualizarPersonalInput, CrearPersonalInput } from '../services/personal.service';
import type { Personal as PersonalType, TipoDocumentoIdentidad } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

/** Códigos del catálogo SUNAT 06 que apis.net.pe puede consultar. */
const CODIGOS_CONSULTABLES: Record<string, 'dni' | 'ruc'> = { '1': 'dni', '6': 'ruc' };

function CampoNumeroDocumento({
  control,
  tipos,
  register,
  getValues,
  setValue,
}: {
  control: Control<CrearPersonalInput>;
  tipos: TipoDocumentoIdentidad[] | undefined;
  register: ReturnType<typeof useForm<CrearPersonalInput>>['register'];
  getValues: () => CrearPersonalInput;
  setValue: UseFormSetValue<CrearPersonalInput>;
}) {
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  const tipoSeleccionadoId = useWatch({ control, name: 'tipoDocumentoIdentidadId' });
  const codigo = tipos?.find((t) => t.id === tipoSeleccionadoId)?.codigo;
  const formato = codigo ? FORMATOS_DOCUMENTO[codigo] : undefined;
  const tipoConsulta = codigo ? CODIGOS_CONSULTABLES[codigo] : undefined;

  async function buscar() {
    if (!tipoConsulta) return;
    const numero = getValues().numeroDocumento;
    if (!numero) return;

    setErrorBusqueda(null);
    setBuscando(true);
    try {
      const datos = await personalService.consultarDocumento(tipoConsulta, numero);
      setValue('nombres', datos.nombres, { shouldValidate: true });
      if (datos.apellidoPaterno) setValue('apellidoPaterno', datos.apellidoPaterno);
      if (datos.apellidoMaterno) setValue('apellidoMaterno', datos.apellidoMaterno);
    } catch (error) {
      setErrorBusqueda(mensajeError(error, 'No se pudo consultar el documento'));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div>
      <label className={labelClass}>N° de documento</label>
      <div className="flex gap-2">
        <input
          {...register('numeroDocumento', {
            required: true,
            pattern: formato ? { value: formato.patron, message: formato.ayuda } : undefined,
          })}
          maxLength={formato?.maxLength}
          className={inputClass}
        />
        {tipoConsulta && (
          <button
            type="button"
            onClick={() => void buscar()}
            disabled={buscando}
            title="Buscar en RENIEC/SUNAT"
            className="flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-3 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
          >
            {buscando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {formato && <p className="mt-1 text-xs text-zinc-500">{formato.ayuda}</p>}
      {errorBusqueda && <p className="mt-1 text-xs text-red-600">{errorBusqueda}</p>}
    </div>
  );
}

export function Personal() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [personalEditando, setPersonalEditando] = useState<PersonalType | null>(null);
  const [personalEliminando, setPersonalEliminando] = useState<PersonalType | null>(null);

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

  const crearForm = useForm<CrearPersonalInput>();
  const editarForm = useForm<ActualizarPersonalInput>();

  const crearMutation = useMutation({
    mutationFn: personalService.crearPersonal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal'] });
      setModalAbierto(false);
      crearForm.reset();
    },
  });

  const editarMutation = useMutation({
    mutationFn: (values: ActualizarPersonalInput) =>
      personalService.actualizarPersonal(personalEditando!.id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal'] });
      setPersonalEditando(null);
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: () => personalService.eliminarPersonal(personalEliminando!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal'] });
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      setPersonalEliminando(null);
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
          {
            encabezado: '',
            render: (p) => (
              <div className="flex items-center gap-3">
                {tienePermiso('personal.editar') && (
                  <button
                    type="button"
                    onClick={() => {
                      setPersonalEditando(p);
                      editarForm.reset({
                        empresaId: p.empresa.id,
                        tipoDocumentoIdentidadId: p.tipoDocumentoIdentidad.id,
                        numeroDocumento: p.numeroDocumento,
                        nombres: p.nombres,
                        apellidoPaterno: p.apellidoPaterno ?? '',
                        apellidoMaterno: p.apellidoMaterno ?? '',
                        activo: p.activo,
                      });
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                )}
                {tienePermiso('personal.eliminar') && p.activo && (
                  <button
                    type="button"
                    onClick={() => setPersonalEliminando(p)}
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
        filas={personalQuery.data ?? []}
        claveFila={(p) => p.id}
        vacio="No hay personal registrado"
      />

      <Modal abierto={modalAbierto} titulo="Nuevo personal" onCerrar={() => setModalAbierto(false)}>
        <form
          onSubmit={crearForm.handleSubmit((values) => crearMutation.mutate(values))}
          className="flex flex-col gap-4"
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el registro')}
            />
          )}

          <div>
            <label className={labelClass}>Empresa</label>
            <select {...crearForm.register('empresaId', { required: true })} className={inputClass}>
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
                {...crearForm.register('tipoDocumentoIdentidadId', { required: true })}
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
            <CampoNumeroDocumento
              control={crearForm.control}
              tipos={tiposDocQuery.data}
              register={crearForm.register}
              getValues={crearForm.getValues}
              setValue={crearForm.setValue}
            />
          </div>

          <div>
            <label className={labelClass}>Nombres</label>
            <input {...crearForm.register('nombres', { required: true })} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Apellido paterno</label>
              <input {...crearForm.register('apellidoPaterno')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Apellido materno</label>
              <input {...crearForm.register('apellidoMaterno')} className={inputClass} />
            </div>
          </div>

          <Button
            type="submit"
            disabled={crearForm.formState.isSubmitting || crearMutation.isPending}
            className="mt-2 w-full"
          >
            Crear personal
          </Button>
        </form>
      </Modal>

      <Modal
        abierto={personalEditando !== null}
        titulo="Editar personal"
        onCerrar={() => setPersonalEditando(null)}
      >
        {personalEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) => editarMutation.mutate(values))}
            className="flex flex-col gap-4"
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el registro')}
              />
            )}

            <div>
              <label className={labelClass}>Nombres</label>
              <input
                {...editarForm.register('nombres', { required: true })}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Apellido paterno</label>
                <input {...editarForm.register('apellidoPaterno')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Apellido materno</label>
                <input {...editarForm.register('apellidoMaterno')} className={inputClass} />
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                {...editarForm.register('activo')}
                className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40"
              />
              Registro activo
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
        abierto={personalEliminando !== null}
        titulo="Desactivar personal"
        mensaje={`¿Seguro que deseas desactivar a "${personalEliminando?.nombres}"? Si tiene una cuenta de usuario, también se desactivará.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setPersonalEliminando(null)}
      />
    </div>
  );
}
