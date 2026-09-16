import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { CalendarClock, ChefHat, Coins, Gift, QrCode, Share2, UtensilsCrossed } from 'lucide-react';
import * as configuracionService from '../services/configuracion.service';
import { useAuth } from '../context/AuthContext';
import { Panel } from '../components/ui/Panel';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Checkbox } from '../components/ui/Checkbox';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { mensajeError } from '../utils/errores';
import { urlImagen } from '../utils/formato';
import type { ConfiguracionRestaurante } from '../types/api';

/** Un slot de QR de cobro (Yape o Plin): la miniatura si ya hay uno subido, y el botón para
 * subir/reemplazarlo. Mismo patrón que la foto de un producto (`Productos.tsx`), pero sin
 * modal: esta página edita todo en el sitio. */
function SlotQrPago({
  medio,
  etiqueta,
  url,
  puedeEditar,
}: {
  medio: 'yape' | 'plin';
  etiqueta: string;
  url: string | null;
  puedeEditar: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const subirMutation = useMutation({
    mutationFn: (archivo: File) => configuracionService.subirQrPago(medio, archivo),
    onSuccess: (datos) => {
      queryClient.setQueryData(['configuracion'], datos);
    },
  });

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100">
        {urlImagen(url) ? (
          <img
            src={urlImagen(url)!}
            alt={`QR de cobro ${etiqueta}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <QrCode className="h-7 w-7 text-zinc-300" strokeWidth={1.25} />
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-700">{etiqueta}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) subirMutation.mutate(archivo);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          variante="secondary"
          disabled={!puedeEditar || subirMutation.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {subirMutation.isPending ? 'Subiendo…' : url ? 'Cambiar QR' : 'Subir QR'}
        </Button>
        {subirMutation.isError && (
          <p className="mt-1 text-xs text-red-600">
            {mensajeError(subirMutation.error, 'No se pudo subir el QR')}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Parámetros operativos del restaurante (FASE 21).
 *
 * Cada campo era, hasta esta fase, una constante escrita en el código. La página los agrupa
 * por el módulo donde se notan —no por el tipo de dato— para que se entienda qué cambia cada
 * uno: quien ajusta el refresco de cocina está pensando en la cocina, no en "un número
 * entero de la configuración".
 */
export function Configuracion() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeEditar = tienePermiso('configuracion.editar');

  const configuracionQuery = useQuery({
    queryKey: ['configuracion'],
    queryFn: configuracionService.obtenerConfiguracion,
  });

  const form = useForm<ConfiguracionRestaurante>();

  // El formulario se rellena cuando llegan los datos: `defaultValues` no sirve porque en el
  // primer render todavía no existen.
  useEffect(() => {
    if (configuracionQuery.data) form.reset(configuracionQuery.data);
  }, [configuracionQuery.data, form]);

  const guardarMutation = useMutation({
    mutationFn: configuracionService.actualizarConfiguracion,
    onSuccess: (datos) => {
      setError(null);
      setGuardado(true);
      form.reset(datos);
      void queryClient.invalidateQueries({ queryKey: ['configuracion'] });
      // La carta pública muestra horario, redes y mensaje: si no se invalida, quien la tenga
      // abierta en otra pestaña seguiría viendo los datos viejos.
      void queryClient.invalidateQueries({ queryKey: ['empresa-publica'] });
    },
    onError: (excepcion) => {
      setGuardado(false);
      setError(mensajeError(excepcion, 'No se pudo guardar la configuración'));
    },
  });

  if (configuracionQuery.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (configuracionQuery.isError) {
    return (
      <EmptyState
        icono={UtensilsCrossed}
        titulo="No se pudo cargar la configuración"
        descripcion={mensajeError(configuracionQuery.error, 'Vuelve a intentarlo en un momento.')}
      />
    );
  }

  return (
    <form
      onSubmit={(evento) =>
        void form.handleSubmit((datos) => guardarMutation.mutateAsync(datos))(evento)
      }
      className="flex flex-col gap-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Configuración</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cómo opera tu restaurante y qué ve el cliente en tu carta pública.
          </p>
        </div>
        {puedeEditar && (
          <Button type="submit" cargando={guardarMutation.isPending}>
            Guardar cambios
          </Button>
        )}
      </header>

      {error && <Alert tipo="error" mensaje={error} />}
      {guardado && !form.formState.isDirty && (
        <Alert tipo="exito" mensaje="Configuración guardada" />
      )}
      {!puedeEditar && (
        <Alert
          tipo="advertencia"
          mensaje="Solo puedes consultar esta configuración: no tienes el permiso para editarla."
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          titulo="Reservas y cocina"
          descripcion="Cómo se comporta el día a día del salón"
          icono={CalendarClock}
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Duración de una reserva (minutos)"
              type="number"
              ayuda="Cuánto tiempo queda bloqueada la mesa cuando no se indica otra duración"
              disabled={!puedeEditar}
              error={form.formState.errors.duracionReservaMinutos?.message}
              {...form.register('duracionReservaMinutos', {
                valueAsNumber: true,
                required: 'Indica la duración',
                min: { value: 10, message: 'Mínimo 10 minutos' },
                max: { value: 480, message: 'Máximo 8 horas' },
              })}
            />
            <Input
              label="Refresco de la pantalla de cocina (segundos)"
              type="number"
              ayuda="Cada cuánto la cocina vuelve a consultar la cola de comandas"
              disabled={!puedeEditar}
              error={form.formState.errors.segundosRefrescoCocina?.message}
              {...form.register('segundosRefrescoCocina', {
                valueAsNumber: true,
                required: 'Indica los segundos',
                min: { value: 3, message: 'Mínimo 3 segundos' },
                max: { value: 120, message: 'Máximo 120 segundos' },
              })}
            />
          </div>
        </Panel>

        <Panel
          titulo="Ventas y costos"
          descripcion="Los números con los que mides el negocio"
          icono={Coins}
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Días de crédito por defecto"
              type="number"
              ayuda="Plazo de una venta al crédito cuando no se pacta una fecha concreta"
              disabled={!puedeEditar}
              error={form.formState.errors.diasCreditoPorDefecto?.message}
              {...form.register('diasCreditoPorDefecto', {
                valueAsNumber: true,
                required: 'Indica los días',
                min: { value: 1, message: 'Mínimo 1 día' },
                max: { value: 365, message: 'Máximo 365 días' },
              })}
            />
            <Input
              label="Food cost objetivo (%)"
              type="number"
              ayuda="Hasta este porcentaje un plato se considera sano en Costos"
              disabled={!puedeEditar}
              error={form.formState.errors.foodCostObjetivo?.message}
              {...form.register('foodCostObjetivo', {
                valueAsNumber: true,
                required: 'Indica el porcentaje',
                min: { value: 1, message: 'Mínimo 1%' },
                max: { value: 99, message: 'Máximo 99%' },
              })}
            />
            <Input
              label="Food cost crítico (%)"
              type="number"
              ayuda="A partir de este porcentaje el plato se marca en rojo"
              disabled={!puedeEditar}
              error={form.formState.errors.foodCostCritico?.message}
              {...form.register('foodCostCritico', {
                valueAsNumber: true,
                required: 'Indica el porcentaje',
                min: { value: 1, message: 'Mínimo 1%' },
                max: { value: 99, message: 'Máximo 99%' },
                validate: (valor) =>
                  valor > form.getValues('foodCostObjetivo') ||
                  'Debe ser mayor que el food cost objetivo',
              })}
            />
          </div>
        </Panel>

        <Panel
          titulo="Fidelización"
          descripcion="Puntos que gana un cliente identificado en cada venta"
          icono={Gift}
        >
          <div className="flex flex-col gap-4">
            <Checkbox
              label="Programa de fidelización activo"
              ayuda="Con esto apagado, las ventas no acumulan puntos aunque tengan cliente"
              disabled={!puedeEditar}
              {...form.register('fidelizacionActiva')}
            />
            <Input
              label="Soles gastados por cada punto"
              type="number"
              step="0.01"
              ayuda="Ej. 10 = el cliente gana 1 punto por cada S/10 de su compra"
              disabled={!puedeEditar}
              error={form.formState.errors.solesPorPunto?.message}
              {...form.register('solesPorPunto', {
                valueAsNumber: true,
                required: 'Indica los soles por punto',
                min: { value: 1, message: 'Mínimo S/1' },
                max: { value: 1000, message: 'Máximo S/1000' },
              })}
            />
            <Input
              label="Valor de un punto al canjear (S/)"
              type="number"
              step="0.01"
              ayuda="No puede superar lo que cuesta ganarlo, o el programa da pérdida"
              disabled={!puedeEditar}
              error={form.formState.errors.valorCanjePunto?.message}
              {...form.register('valorCanjePunto', {
                valueAsNumber: true,
                required: 'Indica el valor de canje',
                min: { value: 0.01, message: 'Mínimo S/0.01' },
                validate: (valor) =>
                  valor <= form.getValues('solesPorPunto') ||
                  'No puede superar los soles por punto',
              })}
            />
          </div>
        </Panel>

        <Panel
          titulo="Carta pública"
          descripcion="Lo que ve un cliente al abrir tu carta"
          icono={ChefHat}
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Horario de atención"
              placeholder="Lun a Sáb de 12:00 a 22:00"
              disabled={!puedeEditar}
              {...form.register('horarioAtencion')}
            />
            <Input
              label="Mensaje de bienvenida"
              placeholder="Cocina criolla con ingredientes del día"
              ayuda="Aparece bajo el titular de tu carta"
              disabled={!puedeEditar}
              {...form.register('mensajeBienvenida')}
            />
            <Checkbox
              label="Aceptar pedidos por WhatsApp desde la carta"
              ayuda="Si lo desactivas, la carta muestra el menú pero no ofrece armar un pedido"
              disabled={!puedeEditar}
              {...form.register('aceptaPedidosWhatsapp')}
            />
          </div>
        </Panel>

        <Panel
          titulo="Pagos digitales"
          descripcion="El QR que muestras en caja para cobrar con Yape o Plin"
          icono={QrCode}
        >
          <div className="flex flex-col gap-5">
            <SlotQrPago
              medio="yape"
              etiqueta="Yape"
              url={configuracionQuery.data?.qrPagoYape ?? null}
              puedeEditar={puedeEditar}
            />
            <SlotQrPago
              medio="plin"
              etiqueta="Plin"
              url={configuracionQuery.data?.qrPagoPlin ?? null}
              puedeEditar={puedeEditar}
            />
            <p className="text-xs text-zinc-500">
              Sube una foto del QR que te muestra tu propia app de Yape o Plin (Cobrar → Mostrar
              QR). Es estático: al cobrar, el cajero lo exhibe junto con el monto a cobrar.
            </p>
          </div>
        </Panel>

        <Panel titulo="Redes sociales" descripcion="Enlaces en el pie de tu carta" icono={Share2}>
          <div className="flex flex-col gap-4">
            <Input
              label="Facebook"
              placeholder="https://facebook.com/tu-restaurante"
              disabled={!puedeEditar}
              error={form.formState.errors.facebookUrl?.message}
              {...form.register('facebookUrl')}
            />
            <Input
              label="Instagram"
              placeholder="https://instagram.com/tu-restaurante"
              disabled={!puedeEditar}
              error={form.formState.errors.instagramUrl?.message}
              {...form.register('instagramUrl')}
            />
            <Input
              label="TikTok"
              placeholder="https://tiktok.com/@tu-restaurante"
              disabled={!puedeEditar}
              error={form.formState.errors.tiktokUrl?.message}
              {...form.register('tiktokUrl')}
            />
          </div>
        </Panel>
      </div>
    </form>
  );
}
