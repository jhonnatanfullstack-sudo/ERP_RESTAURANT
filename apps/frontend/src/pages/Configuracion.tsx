import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { CalendarClock, ChefHat, Coins, Share2, UtensilsCrossed } from 'lucide-react';
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
import type { ConfiguracionRestaurante } from '../types/api';

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
