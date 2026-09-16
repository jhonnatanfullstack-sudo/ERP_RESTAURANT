import { useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { CheckCircle2, FileWarning, MessageSquareWarning, Printer } from 'lucide-react';
import * as reclamacionesService from '../../services/reclamaciones.service';
import * as demoService from '../../services/demo.service';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { Textarea } from '../../components/ui/Textarea';
import { SeccionFormulario } from '../../components/ui/SeccionFormulario';
import { TarjetaOpcion } from '../../components/ui/TarjetaOpcion';
import { mensajeError } from '../../utils/errores';
import { useMetaDocumento } from '../../hooks/useMetaDocumento';
import type { CrearReclamacionPublicaInput } from '../../services/reclamaciones.service';
import type { Reclamacion } from '../../types/api';

function ConfirmacionReclamo({ reclamacion, slug }: { reclamacion: Reclamacion; slug: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
        <CheckCircle2 className="h-7 w-7 text-emerald-600" strokeWidth={2} />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-(--carta-texto)">
        {reclamacion.tipo === 'reclamo' ? 'Reclamo' : 'Queja'} registrado
      </h1>
      <p className="mt-3 text-(--carta-suave)">
        Tu número de seguimiento es{' '}
        <strong className="text-(--carta-texto)">
          N° {String(reclamacion.numero).padStart(6, '0')}
        </strong>
        . El negocio tiene hasta 30 días calendario para responderte.
      </p>

      {/* Constancia imprimible: lo que el reglamento exige entregarle al consumidor. */}
      <div className="mt-8 rounded-2xl border border-(--carta-borde) bg-(--carta-superficie) p-6 text-left text-sm">
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-(--carta-suave)">Tipo</dt>
            <dd className="font-medium capitalize">{reclamacion.tipo}</dd>
          </div>
          <div>
            <dt className="text-(--carta-suave)">Fecha</dt>
            <dd className="font-medium">
              {new Date(reclamacion.creadoEn).toLocaleDateString('es-PE')}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-(--carta-suave)">Producto o servicio</dt>
            <dd className="font-medium">{reclamacion.descripcionBien}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-(--carta-suave)">Detalle</dt>
            <dd className="font-medium">{reclamacion.detalle}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 print:hidden">
        <Button
          type="button"
          icono={<Printer className="h-4 w-4" />}
          onClick={() => window.print()}
        >
          Imprimir constancia
        </Button>
        <a
          href={`/carta/${slug}`}
          className="text-sm font-medium text-(--carta-acento) hover:opacity-80"
        >
          Volver a la carta
        </a>
      </div>
    </div>
  );
}

/**
 * Libro de Reclamaciones Virtual: todo negocio que atiende público en Perú debe tener uno,
 * accesible sin exigirle al consumidor ser cliente ni tener boleta (Ley 29571 y su reglamento,
 * D.S. 101-2022-PCM). El enlace vive en el pie de página de toda la carta pública
 * (`PublicLayout.tsx`), que es donde el reglamento pide que sea visible.
 */
export function LibroReclamaciones() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [enviado, setEnviado] = useState<Reclamacion | null>(null);

  const empresaQuery = useQuery({
    queryKey: ['empresa-reclamaciones', slug],
    queryFn: () => reclamacionesService.obtenerEmpresaParaReclamaciones(slug),
    enabled: slug.length > 0,
  });
  const tiposQuery = useQuery({
    queryKey: ['tipos-documento-identidad-publico'],
    queryFn: demoService.listarTiposDocumentoPublico,
    retry: false,
  });

  const form = useForm<CrearReclamacionPublicaInput>({ defaultValues: { tipo: 'reclamo' } });
  const tipo = useWatch({ control: form.control, name: 'tipo' });
  const esMenorEdad = useWatch({ control: form.control, name: 'esMenorEdad' });

  useMetaDocumento({
    titulo: empresaQuery.data
      ? `Libro de Reclamaciones — ${empresaQuery.data.razonSocial}`
      : 'Libro de Reclamaciones',
    descripcion: 'Formulario del Libro de Reclamaciones Virtual.',
    imagen: null,
  });

  const mutation = useMutation({
    mutationFn: (values: CrearReclamacionPublicaInput) =>
      reclamacionesService.crearReclamacionPublica(slug, values),
    onSuccess: setEnviado,
  });

  if (enviado) return <ConfirmacionReclamo reclamacion={enviado} slug={slug} />;

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-[0.2em] text-(--carta-acento) uppercase">
          Libro de Reclamaciones Virtual
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-(--carta-texto) sm:text-4xl">
          Reclama o presenta tu queja
        </h1>
        {empresaQuery.data && (
          <p className="mt-3 text-sm text-(--carta-suave)">
            Este libro pertenece a <strong>{empresaQuery.data.razonSocial}</strong>, RUC{' '}
            {empresaQuery.data.ruc}
            {empresaQuery.data.direccion ? `, ${empresaQuery.data.direccion}` : ''}.
          </p>
        )}
        <p className="mt-3 text-xs text-(--carta-suave)">
          Conforme al Código de Protección y Defensa del Consumidor (Ley 29571), no hace falta haber
          comprado ni ser cliente registrado para presentar un reclamo o una queja.
        </p>
      </div>

      {mutation.isError && (
        <div className="mb-5">
          <Alert
            tipo="error"
            mensaje={mensajeError(mutation.error, 'No se pudo registrar tu reclamo')}
          />
        </div>
      )}

      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="flex flex-col gap-5"
        noValidate
      >
        <Controller
          control={form.control}
          name="tipo"
          render={({ field }) => (
            <div className="flex flex-col gap-3 sm:flex-row">
              <TarjetaOpcion
                activo={field.value === 'reclamo'}
                icono={FileWarning}
                titulo="Reclamo"
                descripcion="Disconformidad con el producto o el servicio."
                onClick={() => field.onChange('reclamo')}
              />
              <TarjetaOpcion
                activo={field.value === 'queja'}
                icono={MessageSquareWarning}
                titulo="Queja"
                descripcion="Malestar con la atención, no con lo que consumiste."
                onClick={() => field.onChange('queja')}
              />
            </div>
          )}
        />

        <SeccionFormulario titulo="Tus datos">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Nombres"
              error={form.formState.errors.consumidorNombres?.message}
              {...form.register('consumidorNombres', { required: 'Indica tus nombres' })}
            />
            <Input
              label="Apellidos"
              error={form.formState.errors.consumidorApellidos?.message}
              {...form.register('consumidorApellidos', { required: 'Indica tus apellidos' })}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Tipo de documento"
              error={form.formState.errors.tipoDocumentoIdentidadId?.message}
              {...form.register('tipoDocumentoIdentidadId', {
                required: 'Elige el tipo de documento',
              })}
            >
              <option value="">Selecciona…</option>
              {tiposQuery.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
            <Input
              label="N° de documento"
              error={form.formState.errors.consumidorNumeroDocumento?.message}
              {...form.register('consumidorNumeroDocumento', {
                required: 'Indica tu número de documento',
              })}
            />
          </div>
          <Input
            label="Domicilio"
            error={form.formState.errors.consumidorDomicilio?.message}
            {...form.register('consumidorDomicilio', { required: 'Indica tu domicilio' })}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Correo electrónico"
              type="email"
              error={form.formState.errors.consumidorEmail?.message}
              {...form.register('consumidorEmail', { required: 'Indica tu correo' })}
            />
            <Input label="Teléfono" ayuda="Opcional" {...form.register('consumidorTelefono')} />
          </div>

          <Checkbox label="Soy menor de edad" {...form.register('esMenorEdad')} />
          {esMenorEdad && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-(--carta-borde) bg-(--carta-elevado) p-3 sm:grid-cols-2">
              <Input
                label="Nombre del padre, madre o apoderado"
                error={form.formState.errors.apoderadoNombre?.message}
                {...form.register('apoderadoNombre', {
                  required: esMenorEdad ? 'Indica el nombre del apoderado' : false,
                })}
              />
              <Input
                label="N° de documento del apoderado"
                error={form.formState.errors.apoderadoNumeroDocumento?.message}
                {...form.register('apoderadoNumeroDocumento', {
                  required: esMenorEdad ? 'Indica el documento del apoderado' : false,
                })}
              />
            </div>
          )}
        </SeccionFormulario>

        <SeccionFormulario titulo={tipo === 'queja' ? 'Tu queja' : 'Tu reclamo'}>
          <Input
            label="Producto o servicio"
            placeholder="Ej. Ají de gallina, atención en mesa"
            error={form.formState.errors.descripcionBien?.message}
            {...form.register('descripcionBien', { required: 'Indica el producto o servicio' })}
          />
          <Input
            label="Monto reclamado (S/)"
            type="number"
            min="0"
            step="0.01"
            ayuda="Opcional"
            {...form.register('montoReclamado', { valueAsNumber: true })}
          />
          <Textarea
            label="Detalle"
            ayuda="Cuenta qué pasó, con la mayor precisión posible."
            error={form.formState.errors.detalle?.message}
            {...form.register('detalle', {
              required: 'Cuéntanos qué pasó',
              minLength: { value: 10, message: 'Cuéntanos un poco más' },
            })}
          />
          <Textarea
            label="¿Qué solicitas?"
            rows={2}
            ayuda="Devolución, cambio, una disculpa..."
            error={form.formState.errors.pedido?.message}
            {...form.register('pedido', { required: 'Indica qué solicitas' })}
          />
        </SeccionFormulario>

        <Button
          type="submit"
          className="w-full"
          cargando={form.formState.isSubmitting || mutation.isPending}
        >
          Enviar {tipo === 'queja' ? 'queja' : 'reclamo'}
        </Button>
      </form>
    </div>
  );
}
