import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useForm,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from 'react-hook-form';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import * as personalService from '../services/personal.service';
import * as empresaService from '../services/empresa.service';
import * as catalogosService from '../services/catalogos.service';
import { useAuth } from '../context/AuthContext';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CampoBusquedaDocumento } from '../components/CampoBusquedaDocumento';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { FormActions } from '../components/ui/FormActions';
import { mensajeError } from '../utils/errores';
import { vacioANull } from '../utils/formulario';
import { nombrePersonal } from '../utils/formato';
import { useEsPersonaJuridica } from '../hooks/useEsPersonaJuridica';
import type { ActualizarPersonalInput, CrearPersonalInput } from '../services/personal.service';
import type { Personal as PersonalType } from '../types/api';

/**
 * Razón social o nombres + apellidos, nunca ambos: depende de si el documento es un
 * RUC de persona jurídica ("20…"). Mismo criterio que el backend
 * (`personal.service.ts: resolverIdentidad`) y que el formulario de Clientes.
 */
function CamposIdentidadPersonal<T extends FieldValues>({
  esJuridica,
  register,
  errores,
}: {
  esJuridica: boolean;
  register: UseFormRegister<T>;
  errores: FieldErrors<T>;
}) {
  const errorDe = (campo: string) =>
    (errores as Record<string, { message?: string } | undefined>)[campo]?.message;

  if (esJuridica) {
    return (
      <Input
        label="Razón social"
        ayuda="Un RUC que empieza en 20 es de una empresa: se identifica por razón social."
        error={errorDe('razonSocial')}
        {...register('razonSocial' as Path<T>, { required: 'La razón social es obligatoria' })}
      />
    );
  }

  return (
    <>
      <Input
        label="Nombres"
        error={errorDe('nombres')}
        {...register('nombres' as Path<T>, { required: 'Los nombres son obligatorios' })}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Apellido paterno"
          error={errorDe('apellidoPaterno')}
          {...register('apellidoPaterno' as Path<T>)}
        />
        <Input
          label="Apellido materno"
          error={errorDe('apellidoMaterno')}
          {...register('apellidoMaterno' as Path<T>)}
        />
      </div>
    </>
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

  const crearEsJuridica = useEsPersonaJuridica({
    control: crearForm.control,
    tipos: tiposDocQuery.data,
    campoTipo: 'tipoDocumentoIdentidadId',
    campoNumero: 'numeroDocumento',
  });
  // Al editar no se cambia el documento, así que el tipo de persona es el que ya
  // tiene el registro: solo una persona jurídica tiene razón social.
  const editandoEsJuridica = !!personalEditando?.razonSocial;

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

  function cerrarCrear() {
    setModalAbierto(false);
    crearForm.reset();
    crearMutation.reset();
  }

  function cerrarEditar() {
    setPersonalEditando(null);
    editarMutation.reset();
  }

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
          { encabezado: 'Nombre / razón social', render: (p) => nombrePersonal(p) },
          {
            encabezado: 'Tipo',
            render: (p) => (
              <span className="text-zinc-500">
                {p.razonSocial ? 'Persona jurídica' : 'Persona natural'}
              </span>
            ),
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
                        nombres: p.nombres ?? '',
                        apellidoPaterno: p.apellidoPaterno ?? '',
                        apellidoMaterno: p.apellidoMaterno ?? '',
                        razonSocial: p.razonSocial ?? '',
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
        cargando={personalQuery.isLoading}
        error={
          personalQuery.isError
            ? mensajeError(personalQuery.error, 'No se pudo cargar el personal')
            : undefined
        }
        onReintentar={() => void personalQuery.refetch()}
      />

      <Modal abierto={modalAbierto} titulo="Nuevo personal" onCerrar={cerrarCrear}>
        <form
          onSubmit={crearForm.handleSubmit((values) =>
            crearMutation.mutate({
              ...values,
              nombres: vacioANull(values.nombres),
              apellidoPaterno: vacioANull(values.apellidoPaterno),
              apellidoMaterno: vacioANull(values.apellidoMaterno),
              razonSocial: vacioANull(values.razonSocial),
              direccion: vacioANull(values.direccion),
            }),
          )}
          className="flex flex-col gap-4"
          noValidate
        >
          {crearMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(crearMutation.error, 'No se pudo crear el registro')}
            />
          )}

          <Select
            label="Empresa"
            error={crearForm.formState.errors.empresaId?.message}
            {...crearForm.register('empresaId', { required: 'Selecciona la empresa' })}
          >
            <option value="">Seleccionar…</option>
            {empresasQuery.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.razonSocial}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Tipo de documento"
              error={crearForm.formState.errors.tipoDocumentoIdentidadId?.message}
              {...crearForm.register('tipoDocumentoIdentidadId', {
                required: 'Selecciona el tipo de documento',
              })}
            >
              <option value="">Seleccionar…</option>
              {tiposDocQuery.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
            <CampoBusquedaDocumento
              control={crearForm.control}
              tipos={tiposDocQuery.data}
              register={crearForm.register}
              getValues={crearForm.getValues}
              campoTipo="tipoDocumentoIdentidadId"
              campoNumero="numeroDocumento"
              requerido
              consultar={personalService.consultarDocumento}
              onEncontrado={(datos) => {
                crearForm.setValue('nombres', datos.nombres ?? '', { shouldValidate: true });
                crearForm.setValue('apellidoPaterno', datos.apellidoPaterno ?? '');
                crearForm.setValue('apellidoMaterno', datos.apellidoMaterno ?? '');
                crearForm.setValue('razonSocial', datos.razonSocial ?? '', {
                  shouldValidate: true,
                });
                // Solo SUNAT (RUC) devuelve domicilio: si no viene, se respeta lo escrito.
                if (datos.direccion) {
                  crearForm.setValue('direccion', datos.direccion);
                }
              }}
            />
          </div>

          <CamposIdentidadPersonal
            esJuridica={crearEsJuridica}
            register={crearForm.register}
            errores={crearForm.formState.errors}
          />

          <Input
            label="Dirección"
            ayuda="Se completa sola al buscar un RUC en SUNAT."
            error={crearForm.formState.errors.direccion?.message}
            {...crearForm.register('direccion')}
          />

          <FormActions
            enviar="Crear personal"
            enviandoTexto="Creando…"
            onCancelar={cerrarCrear}
            enviando={crearForm.formState.isSubmitting || crearMutation.isPending}
          />
        </form>
      </Modal>

      <Modal abierto={personalEditando !== null} titulo="Editar personal" onCerrar={cerrarEditar}>
        {personalEditando && (
          <form
            onSubmit={editarForm.handleSubmit((values) =>
              editarMutation.mutate({
                ...values,
                nombres: vacioANull(values.nombres),
                apellidoPaterno: vacioANull(values.apellidoPaterno),
                apellidoMaterno: vacioANull(values.apellidoMaterno),
                razonSocial: vacioANull(values.razonSocial),
                direccion: vacioANull(values.direccion),
              }),
            )}
            className="flex flex-col gap-4"
            noValidate
          >
            {editarMutation.isError && (
              <Alert
                tipo="error"
                mensaje={mensajeError(editarMutation.error, 'No se pudo actualizar el registro')}
              />
            )}

            <CamposIdentidadPersonal
              esJuridica={editandoEsJuridica}
              register={editarForm.register}
              errores={editarForm.formState.errors}
            />

            <Input
              label="Dirección"
              error={editarForm.formState.errors.direccion?.message}
              {...editarForm.register('direccion')}
            />

            <Checkbox
              label="Registro activo"
              ayuda="Al desactivarlo, su cuenta de usuario también se desactiva."
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
        abierto={personalEliminando !== null}
        titulo="Desactivar personal"
        mensaje={`¿Seguro que deseas desactivar a "${nombrePersonal(personalEliminando)}"? Si tiene una cuenta de usuario, también se desactivará.`}
        confirmando={eliminarMutation.isPending}
        onConfirmar={() => eliminarMutation.mutate()}
        onCancelar={() => setPersonalEliminando(null)}
      />
    </div>
  );
}
