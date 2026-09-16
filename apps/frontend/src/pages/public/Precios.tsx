import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChefHat, Clock, Mail, Phone, Sparkles } from 'lucide-react';
import * as suscripcionService from '../../services/suscripcion.service';
import * as demoService from '../../services/demo.service';
import { useAuth } from '../../context/AuthContext';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Spinner } from '../../components/ui/Spinner';
import { mensajeError } from '../../utils/errores';
import type { CicloFacturacion, PlanPublico } from '../../types/api';

const CICLOS: Array<{ id: CicloFacturacion; etiqueta: string; nota?: string }> = [
  { id: 'mensual', etiqueta: 'Mensual' },
  { id: 'trimestral', etiqueta: 'Trimestral', nota: '8% dcto.' },
  { id: 'anual', etiqueta: 'Anual', nota: '2 meses gratis' },
];

const MESES_POR_CICLO: Record<CicloFacturacion, number> = {
  mensual: 1,
  trimestral: 3,
  anual: 12,
};

function formatearMonto(valor: number): string {
  return `S/ ${valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Modal de confirmación al elegir un plan (solo para quien ya tiene cuenta): muestra el
 * resumen, envía la solicitud y, sin pasarela de pago conectada todavía, explica cómo pagar
 * y activar a mano — ver `decisiones-tecnicas.md`. */
function ModalConfirmarSolicitud({
  plan,
  ciclo,
  onCerrar,
}: {
  plan: PlanPublico;
  ciclo: CicloFacturacion;
  onCerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [mensajeContacto, setMensajeContacto] = useState('');

  const infoQuery = useQuery({
    queryKey: ['demo-informacion'],
    queryFn: demoService.obtenerInformacionDemo,
  });

  const solicitarMutation = useMutation({
    mutationFn: () =>
      suscripcionService.solicitarSuscripcion({
        plan: plan.id,
        ciclo,
        mensajeContacto: mensajeContacto.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mis-solicitudes-suscripcion'] });
    },
  });

  const contacto = infoQuery.data?.proveedor;

  return (
    <Modal
      abierto
      titulo={solicitarMutation.isSuccess ? 'Solicitud enviada' : `Plan ${plan.nombre}`}
      onCerrar={onCerrar}
    >
      {solicitarMutation.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert
            tipo="exito"
            mensaje="Registramos tu solicitud. En cuanto confirmemos el pago, tu cuenta queda activa por el tiempo que elegiste."
          />
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
            <p className="mb-2 font-semibold text-zinc-900">Cómo completar el pago</p>
            <p className="mb-2">
              Aún no tenemos pasarela de pago conectada: realiza el pago por Yape, Plin o
              transferencia y escríbenos con tu comprobante para activarte al toque.
            </p>
            {contacto && (
              <div className="flex flex-col gap-1.5">
                {contacto.telefono && (
                  <a
                    href={`https://wa.me/${contacto.telefono.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {contacto.telefono}
                  </a>
                )}
                {contacto.email && (
                  <a
                    href={`mailto:${contacto.email}`}
                    className="inline-flex items-center gap-1.5 font-medium text-orange-600 hover:text-orange-700"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {contacto.email}
                  </a>
                )}
              </div>
            )}
          </div>
          <Button type="button" onClick={onCerrar}>
            Entendido
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-600">
                {CICLOS.find((c) => c.id === ciclo)?.etiqueta} · {MESES_POR_CICLO[ciclo]}{' '}
                {MESES_POR_CICLO[ciclo] === 1 ? 'mes' : 'meses'}
              </span>
              <span className="text-lg font-bold text-zinc-900">
                {formatearMonto(plan.precios[ciclo])}
              </span>
            </div>
          </div>

          {solicitarMutation.isError && (
            <Alert
              tipo="error"
              mensaje={mensajeError(solicitarMutation.error, 'No se pudo enviar la solicitud')}
            />
          )}

          <div>
            <label
              htmlFor="mensaje-contacto"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Nota (opcional)
            </label>
            <textarea
              id="mensaje-contacto"
              value={mensajeContacto}
              onChange={(e) => setMensajeContacto(e.target.value)}
              placeholder="Ej. ya hice el Yape, número de operación 123456"
              rows={3}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none"
            />
          </div>

          <Button
            type="button"
            onClick={() => solicitarMutation.mutate()}
            cargando={solicitarMutation.isPending}
          >
            Enviar solicitud
          </Button>
        </div>
      )}
    </Modal>
  );
}

/**
 * Página de precios, pública (FASE 29). Tres planes fijos (ver `modules/suscripcion/planes.ts`
 * en el backend, única fuente de verdad de los precios) por tres ciclos de pago.
 *
 * Sin pasarela de pago conectada todavía, el botón de cada plan no cobra nada: crea una
 * `SolicitudSuscripcion` que el proveedor confirma a mano desde `/plataforma` una vez que
 * recibe el pago (Yape/transferencia) — ver `decisiones-tecnicas.md`. El día que se conecte un
 * gateway real, ese mismo flujo pasa a confirmarse solo por webhook, sin rediseñar nada de
 * esta página.
 */
export function Precios() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const [ciclo, setCiclo] = useState<CicloFacturacion>('anual');
  const [planElegido, setPlanElegido] = useState<PlanPublico | null>(null);

  const planesQuery = useQuery({
    queryKey: ['planes-suscripcion'],
    queryFn: suscripcionService.obtenerPlanes,
  });

  function elegirPlan(plan: PlanPublico) {
    if (!usuario) {
      navigate('/registro');
      return;
    }
    setPlanElegido(plan);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 shadow-sm shadow-orange-600/30">
              <ChefHat className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <span className="text-base font-bold text-zinc-900">Restaurant ERP</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            {usuario ? (
              <Link to="/" className="font-medium text-zinc-600 hover:text-zinc-900">
                Ir al sistema
              </Link>
            ) : (
              <>
                <Link to="/login" className="font-medium text-zinc-600 hover:text-zinc-900">
                  Iniciar sesión
                </Link>
                <Link
                  to="/registro"
                  className="rounded-lg bg-orange-600 px-3.5 py-2 font-semibold text-white shadow-sm shadow-orange-600/20 hover:bg-orange-700"
                >
                  Probar gratis
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            Un plan para cada etapa de tu restaurante
          </h1>
          <p className="mt-4 text-zinc-600">
            Empieza con lo operativo, suma facturación electrónica a SUNAT cuando la necesites, y
            pasa a completo cuando quieras controlar también inventario y costos.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-zinc-200 bg-white p-1 shadow-sm">
            {CICLOS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCiclo(c.id)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  ciclo === c.id ? 'bg-orange-600 text-white' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {c.etiqueta}
                {c.nota && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      ciclo === c.id ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {c.nota}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {planesQuery.isLoading ? (
          <div className="mt-14 flex justify-center">
            <Spinner />
          </div>
        ) : planesQuery.isError ? (
          <div className="mt-10">
            <Alert
              tipo="error"
              mensaje={mensajeError(planesQuery.error, 'No se pudieron cargar los planes')}
            />
          </div>
        ) : (
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {planesQuery.data?.map((plan, indice) => {
              const destacado = indice === 1;
              const meses = MESES_POR_CICLO[ciclo];
              const precioMensualEquivalente = plan.precios[ciclo] / meses;
              return (
                <div
                  key={plan.id}
                  className={`animar-entrada relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
                    destacado ? 'border-orange-500 ring-1 ring-orange-500/30' : 'border-zinc-200'
                  }`}
                  style={{ animationDelay: `${indice * 60}ms` }}
                >
                  {destacado && (
                    <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                      <Sparkles className="h-3 w-3" />
                      Más elegido
                    </span>
                  )}
                  <h2 className="text-lg font-bold text-zinc-900">{plan.nombre}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{plan.descripcion}</p>

                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-bold tabular-nums text-zinc-900">
                      {formatearMonto(precioMensualEquivalente)}
                    </span>
                    <span className="text-sm text-zinc-500">/mes</span>
                  </div>
                  {ciclo !== 'mensual' && (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {formatearMonto(plan.precios[ciclo])} facturado{' '}
                      {ciclo === 'anual' ? 'una vez al año' : 'cada 3 meses'}
                    </p>
                  )}

                  <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                    {plan.caracteristicas.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-sm text-zinc-700">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                          strokeWidth={2.5}
                        />
                        {c}
                      </li>
                    ))}
                  </ul>

                  <Button
                    type="button"
                    variante={destacado ? 'primary' : 'secondary'}
                    className="mt-6 w-full justify-center"
                    onClick={() => elegirPlan(plan)}
                  >
                    {usuario ? 'Elegir este plan' : 'Probar gratis y elegir después'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mx-auto mt-14 flex max-w-2xl items-start gap-3 rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <p>
            Toda cuenta nueva empieza con <strong>15 días de prueba gratis</strong>, sin tarjeta ni
            compromiso. Elige tu plan cuando estés listo para activar el sistema — desde aquí mismo,
            o escribiéndonos directamente.
          </p>
        </div>
      </div>

      {planElegido && (
        <ModalConfirmarSolicitud
          plan={planElegido}
          ciclo={ciclo}
          onCerrar={() => setPlanElegido(null)}
        />
      )}
    </div>
  );
}
