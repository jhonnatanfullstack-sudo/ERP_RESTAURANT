import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  ChefHat,
  Flame,
  Printer,
  Timer,
  Utensils,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import * as comandasService from '../services/comandas.service';
import * as configuracionService from '../services/configuracion.service';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { formatearFechaHora, nombreMesa } from '../utils/formato';
import { minutosDesde } from '../utils/metricas';
import { sonarComandaLista, sonarComandaNueva } from '../utils/sonido';
import type { Comanda, EstadoComanda } from '../types/api';

const ETIQUETA_ESTADO: Record<EstadoComanda, string> = {
  pendiente: 'En cola',
  en_preparacion: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelada: 'Cancelada',
};

const TONO_ESTADO: Record<EstadoComanda, 'exito' | 'neutral' | 'peligro'> = {
  pendiente: 'neutral',
  en_preparacion: 'neutral',
  listo: 'exito',
  entregado: 'neutral',
  cancelada: 'peligro',
};

const ACCION_SIGUIENTE: Partial<
  Record<EstadoComanda, { estado: EstadoComanda; etiqueta: string }>
> = {
  pendiente: { estado: 'en_preparacion', etiqueta: 'Empezar a preparar' },
  en_preparacion: { estado: 'listo', etiqueta: 'Marcar listo' },
  listo: { estado: 'entregado', etiqueta: 'Entregar' },
};

/** Las tres columnas en vivo del tablero. Mismos colores que el resumen de cocina del
 * Dashboard (`ESTADOS_COCINA`), para que un mismo estado se lea igual en toda la app. */
const COLUMNAS: Array<{
  estado: EstadoComanda;
  etiqueta: string;
  icono: typeof Timer;
  clasesEncabezado: string;
}> = [
  {
    estado: 'pendiente',
    etiqueta: 'En cola',
    icono: Timer,
    clasesEncabezado: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    estado: 'en_preparacion',
    etiqueta: 'Preparando',
    icono: Flame,
    clasesEncabezado: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    estado: 'listo',
    etiqueta: 'Listo',
    icono: CheckCircle2,
    clasesEncabezado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
];

/** A partir de cuántos minutos sin avanzar una comanda se resalta en rojo. Mismo umbral que
 * usa el Dashboard (`minutos >= 20`) para la cola de cocina — ver `Dashboard.tsx`. */
const MINUTOS_URGENTE = 20;
const MINUTOS_ATENCION = 10;

const CLAVE_SONIDO = 'restaurant-erp:cocina-sonido';

type Filtro = 'activas' | 'todas';

/** Tarjeta de una comanda dentro de su columna. `layout` la hace acomodarse suavemente si el
 * orden cambia; el padre la envuelve en `AnimatePresence` para la entrada/salida al cambiar de
 * columna (ver `Cocina`). */
function TarjetaComanda({
  comanda,
  ahora,
  puedeAvanzar,
  puedeCancelar,
  avanzando,
  onAvanzar,
  onCancelar,
}: {
  comanda: Comanda;
  ahora: Date;
  puedeAvanzar: boolean;
  puedeCancelar: boolean;
  avanzando: boolean;
  onAvanzar: (estado: EstadoComanda) => void;
  onCancelar: () => void;
}) {
  const accion = ACCION_SIGUIENTE[comanda.estado];
  const minutos = minutosDesde(comanda.creadoEn, ahora);
  const urgente = comanda.estado !== 'listo' && minutos >= MINUTOS_URGENTE;
  const atencion = comanda.estado !== 'listo' && !urgente && minutos >= MINUTOS_ATENCION;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16, transition: { duration: 0.18 } }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className={`flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm ${
        urgente ? 'border-red-300 ring-1 ring-red-200' : 'border-zinc-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-zinc-900">{nombreMesa(comanda.pedido.mesa)}</p>
          <p className="text-xs text-zinc-500">{formatearFechaHora(comanda.creadoEn)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
              urgente
                ? 'bg-red-100 text-red-700'
                : atencion
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-zinc-100 text-zinc-500'
            }`}
          >
            <Timer className="h-3 w-3" />
            {minutos} min
          </span>
          <button
            type="button"
            title="Imprimir comanda"
            onClick={() => window.open(`/imprimir/comanda/${comanda.id}`, '_blank')}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <Printer className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-1.5 border-t border-zinc-100 pt-3">
        {comanda.detalles.map((detalle) => (
          <li key={detalle.id} className="flex items-start gap-2 text-sm">
            <Utensils className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span>
              <span className="font-semibold text-zinc-900">{detalle.cantidad}×</span>{' '}
              {detalle.producto.nombre}
              {detalle.notas && (
                <span className="block text-xs text-zinc-500">{detalle.notas}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {(accion || (comanda.estado === 'pendiente' && puedeCancelar)) && (
        <div className="mt-1 flex items-center gap-2 border-t border-zinc-100 pt-3">
          {accion && puedeAvanzar && (
            <Button
              icono={
                accion.estado === 'entregado' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Flame className="h-4 w-4" />
                )
              }
              onClick={() => onAvanzar(accion.estado)}
              disabled={avanzando}
              className="flex-1"
            >
              {accion.etiqueta}
            </Button>
          )}
          {comanda.estado === 'pendiente' && puedeCancelar && (
            <Button
              variante="secondary"
              icono={<XCircle className="h-4 w-4" />}
              onClick={onCancelar}
            >
              Cancelar
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function Cocina() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>('activas');
  const [comandaCancelando, setComandaCancelando] = useState<Comanda | null>(null);
  const [sonidoActivo, setSonidoActivo] = useState(
    () => localStorage.getItem(CLAVE_SONIDO) !== 'off',
  );
  // Reloj propio (no depende del refetch) para que el contador de minutos de cada tarjeta
  // avance solo, en vez de quedarse clavado hasta el próximo refresco de la cola.
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  function alternarSonido() {
    setSonidoActivo((valor) => {
      const nuevo = !valor;
      localStorage.setItem(CLAVE_SONIDO, nuevo ? 'on' : 'off');
      return nuevo;
    });
  }

  // El ritmo de refresco lo define el restaurante en Configuración. Se consulta aparte y
  // con `staleTime` alto: cambia muy de vez en cuando y no tiene sentido re-pedirla
  // junto a cada refresco de la cola.
  const configuracionQuery = useQuery({
    queryKey: ['configuracion'],
    queryFn: configuracionService.obtenerConfiguracion,
    staleTime: 10 * 60 * 1000,
  });

  const comandasQuery = useQuery({
    queryKey: ['comandas'],
    queryFn: comandasService.listarComandas,
    // Cada restaurante define su propio ritmo en Configuración (FASE 21): antes era un
    // valor fijo de 8 segundos para todos.
    refetchInterval: (configuracionQuery.data?.segundosRefrescoCocina ?? 8) * 1000,
  });

  // Alerta sonora ante comandas nuevas o que acaban de quedar listas — para que cocina no
  // dependa de tener la vista fija en la pantalla. Compara contra el fetch anterior; el
  // `null` inicial evita sonar por todo lo que ya estaba en cola al entrar a la pantalla.
  const estadosPrevios = useRef<Map<string, EstadoComanda> | null>(null);
  useEffect(() => {
    if (!comandasQuery.data) return;
    const actuales = new Map(comandasQuery.data.map((c) => [c.id, c.estado] as const));
    const previos = estadosPrevios.current;
    if (previos && sonidoActivo) {
      let hayNueva = false;
      let hayLista = false;
      for (const [id, estado] of actuales) {
        const antes = previos.get(id);
        if (antes === undefined && estado === 'pendiente') hayNueva = true;
        if (antes && antes !== 'listo' && estado === 'listo') hayLista = true;
      }
      if (hayNueva) sonarComandaNueva();
      else if (hayLista) sonarComandaLista();
    }
    estadosPrevios.current = actuales;
  }, [comandasQuery.data, sonidoActivo]);

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['comandas'] });
    queryClient.invalidateQueries({ queryKey: ['pedidos'] });
  }

  const avanzarMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoComanda }) =>
      comandasService.actualizarEstadoComanda(id, estado),
    onSuccess: invalidar,
  });

  const cancelarMutation = useMutation({
    mutationFn: () => comandasService.cancelarComanda(comandaCancelando!.id),
    onSuccess: () => {
      invalidar();
      setComandaCancelando(null);
    },
  });

  if (comandasQuery.isLoading) return <Spinner />;

  const comandas = comandasQuery.data ?? [];
  // En "Todas" las entregadas/canceladas no entran al tablero de columnas — son historial, no
  // trabajo pendiente — se listan aparte, más discretas.
  const historial =
    filtro === 'todas'
      ? comandas.filter((c) => c.estado === 'entregado' || c.estado === 'cancelada')
      : [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Cocina</h1>
          <p className="mt-1 text-sm text-zinc-500">Comandas enviadas desde las mesas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={alternarSonido}
            title={sonidoActivo ? 'Silenciar alertas' : 'Activar alertas de sonido'}
            className="rounded-full bg-zinc-100 p-2 text-zinc-600 transition-colors hover:bg-zinc-200"
          >
            {sonidoActivo ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <div className="flex gap-2">
            {(['activas', 'todas'] as const).map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setFiltro(valor)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  filtro === valor
                    ? 'bg-orange-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {valor === 'activas' ? 'Activas' : 'Todas'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {comandas.length === 0 ? (
        <EmptyState icono={ChefHat} titulo="No hay comandas para mostrar" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {COLUMNAS.map(({ estado, etiqueta, icono: Icono, clasesEncabezado }) => {
            const comandasColumna = comandas.filter((c) => c.estado === estado);
            return (
              <div key={estado} className="flex flex-col gap-3">
                <div
                  className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${clasesEncabezado}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icono className="h-4 w-4" />
                    {etiqueta}
                  </span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold tabular-nums">
                    {comandasColumna.length}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <AnimatePresence initial={false}>
                    {comandasColumna.length === 0 ? (
                      <motion.p
                        key="vacio"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="rounded-xl border border-dashed border-zinc-200 py-6 text-center text-xs text-zinc-400"
                      >
                        Sin comandas aquí
                      </motion.p>
                    ) : (
                      comandasColumna.map((comanda) => (
                        <TarjetaComanda
                          key={comanda.id}
                          comanda={comanda}
                          ahora={ahora}
                          puedeAvanzar={tienePermiso('cocina.editar')}
                          puedeCancelar={tienePermiso('cocina.eliminar')}
                          avanzando={avanzarMutation.isPending}
                          onAvanzar={(estadoSiguiente) =>
                            avanzarMutation.mutate({ id: comanda.id, estado: estadoSiguiente })
                          }
                          onCancelar={() => setComandaCancelando(comanda)}
                        />
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {historial.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-sm font-semibold text-zinc-500">Entregadas y canceladas hoy</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {historial.map((comanda) => (
              <div
                key={comanda.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3.5 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate text-zinc-600">
                  {nombreMesa(comanda.pedido.mesa)}
                  <span className="text-zinc-400"> · {formatearFechaHora(comanda.creadoEn)}</span>
                </span>
                <Badge tono={TONO_ESTADO[comanda.estado]}>{ETIQUETA_ESTADO[comanda.estado]}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        abierto={comandaCancelando !== null}
        titulo="Cancelar comanda"
        mensaje="Los productos volverán a estar disponibles para editar o enviar de nuevo en el pedido. ¿Deseas continuar?"
        confirmando={cancelarMutation.isPending}
        onConfirmar={() => cancelarMutation.mutate()}
        onCancelar={() => setComandaCancelando(null)}
      />
    </div>
  );
}
