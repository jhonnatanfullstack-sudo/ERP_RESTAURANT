import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, QrCode, Trash2, Users } from 'lucide-react';
import { formatearHora, nombreCliente } from '../utils/formato';
import { calcularOcupacionMesa, minutosDesde } from '../utils/estadoMesa';
import type { EstadoOcupacionMesa, OcupacionMesa } from '../utils/estadoMesa';
import type { Mesa, Pedido, Reserva } from '../types/api';

interface ConfigEstado {
  etiqueta: string;
  borde: string;
  fondo: string;
  texto: string;
  punto: string;
}

const CONFIG_ESTADO: Record<EstadoOcupacionMesa, ConfigEstado> = {
  libre: {
    etiqueta: 'Libre',
    borde: 'border-emerald-200',
    fondo: 'bg-emerald-50',
    texto: 'text-emerald-700',
    punto: 'bg-emerald-500',
  },
  ocupada: {
    etiqueta: 'Ocupada',
    borde: 'border-red-200',
    fondo: 'bg-red-50',
    texto: 'text-red-700',
    punto: 'bg-red-500',
  },
  reservada: {
    etiqueta: 'Reservada',
    borde: 'border-amber-200',
    fondo: 'bg-amber-50',
    texto: 'text-amber-700',
    punto: 'bg-amber-500',
  },
  inactiva: {
    etiqueta: 'Inactiva',
    borde: 'border-zinc-200',
    fondo: 'bg-zinc-50',
    texto: 'text-zinc-400',
    punto: 'bg-zinc-300',
  },
};

/** Mesa redonda para grupos chicos, rectangular para grupos grandes — con un asiento por
 * comensal (hasta 10, para que la mesa no se llene de puntos) alrededor del tablero. Se dibuja
 * a mano en vez de traer un ícono de librería: es el único glifo que necesita reflejar la
 * capacidad real de cada mesa. */
function IconoMesa({ capacidad, className }: { capacidad: number; className?: string }) {
  const redonda = capacidad <= 4;
  const asientos = Math.min(Math.max(capacidad, 1), 10);
  const cx = 32;
  const cy = 32;
  const rx = redonda ? 15 : 23;
  const ry = redonda ? 15 : 14;

  const puntos = Array.from({ length: asientos }, (_, i) => {
    const angulo = (i / asientos) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + rx * Math.cos(angulo), y: cy + ry * Math.sin(angulo) };
  });

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {redonda ? (
        <circle
          cx={cx}
          cy={cy}
          r="11"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ) : (
        <rect
          x={cx - 16}
          y={cy - 9}
          width="32"
          height="18"
          rx="6"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      )}
      {puntos.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.2" fill="currentColor" />
      ))}
    </svg>
  );
}

function textoEstado(ocupacion: OcupacionMesa): string {
  if (ocupacion.estado === 'ocupada' && ocupacion.pedido) {
    return `Ocupada · hace ${minutosDesde(ocupacion.pedido.creadoEn)} min`;
  }
  if (ocupacion.estado === 'reservada' && ocupacion.reserva) {
    return `Reservada · ${formatearHora(ocupacion.reserva.fechaHora)} — ${nombreCliente(ocupacion.reserva.cliente)}`;
  }
  return CONFIG_ESTADO[ocupacion.estado].etiqueta;
}

interface TarjetaMesaProps {
  mesa: Mesa;
  ocupacion: OcupacionMesa;
  indice: number;
  seleccionable: boolean;
  seleccionada: boolean;
  onSeleccionar?: (mesa: Mesa) => void;
  puedeEditar?: boolean;
  puedeEliminar?: boolean;
  onEditar?: (mesa: Mesa) => void;
  onEliminar?: (mesa: Mesa) => void;
  onVerQr?: (mesa: Mesa) => void;
}

function TarjetaMesa({
  mesa,
  ocupacion,
  indice,
  seleccionable,
  seleccionada,
  onSeleccionar,
  puedeEditar,
  puedeEliminar,
  onEditar,
  onEliminar,
  onVerQr,
}: TarjetaMesaProps) {
  const config = CONFIG_ESTADO[ocupacion.estado];
  // En modo selector (armar un pedido) no se puede elegir una mesa ocupada o inactiva; una
  // reservada sí se deja elegir — el formulario exige entonces el mismo cliente de la reserva.
  const deshabilitada =
    seleccionable && (ocupacion.estado === 'ocupada' || ocupacion.estado === 'inactiva');
  const clickable = seleccionable ? !deshabilitada : !!puedeEditar;

  // Destello breve cuando la mesa cambia de estado (se abrió un pedido, se liberó, etc.): sin
  // esto el cambio de color pasa casi desapercibido en un plano con muchas mesas. El primer
  // render no cuenta como "cambio" — si contara, todas las mesas destellarían al cargar la
  // página.
  const estadoPrevio = useRef(ocupacion.estado);
  const [destello, setDestello] = useState(0);
  useEffect(() => {
    if (estadoPrevio.current !== ocupacion.estado) {
      setDestello((valor) => valor + 1);
      estadoPrevio.current = ocupacion.estado;
    }
  }, [ocupacion.estado]);

  return (
    <div className="group animar-entrada relative" style={{ animationDelay: `${indice * 20}ms` }}>
      <motion.button
        type="button"
        disabled={!clickable}
        onClick={() => {
          if (seleccionable) onSeleccionar?.(mesa);
          else if (puedeEditar) onEditar?.(mesa);
        }}
        whileTap={clickable ? { scale: 0.96 } : undefined}
        animate={destello > 0 ? { scale: [1, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border p-3.5 text-center transition-all duration-200 ${config.borde} ${config.fondo} ${
          clickable
            ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md'
            : deshabilitada
              ? 'cursor-not-allowed opacity-55'
              : ''
        } ${seleccionada ? 'ring-2 ring-orange-500 ring-offset-2' : ''}`}
      >
        {ocupacion.estado === 'ocupada' && (
          <span className="absolute top-2 left-2 flex h-2 w-2">
            <span className="animar-latido absolute inline-flex h-full w-full rounded-full bg-red-400" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        )}

        <IconoMesa capacidad={mesa.capacidad} className={`h-11 w-11 ${config.texto}`} />
        <div className="text-sm font-bold text-zinc-900">Mesa {mesa.numero}</div>
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <Users className="h-3 w-3" />
          {mesa.capacidad} {mesa.capacidad === 1 ? 'persona' : 'personas'}
        </div>
        <span
          className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${config.texto}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.punto}`} />
          <span className="truncate">{textoEstado(ocupacion)}</span>
        </span>
      </motion.button>

      {!seleccionable && onVerQr && (
        <button
          type="button"
          onClick={(evento) => {
            evento.stopPropagation();
            onVerQr(mesa);
          }}
          aria-label={`Ver QR de autopedido de la mesa ${mesa.numero}`}
          className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-400 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-orange-600"
        >
          <QrCode className="h-3.5 w-3.5" />
        </button>
      )}
      {!seleccionable && puedeEliminar && (
        <button
          type="button"
          onClick={(evento) => {
            evento.stopPropagation();
            onEliminar?.(mesa);
          }}
          aria-label={`Eliminar mesa ${mesa.numero}`}
          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-400 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      {!seleccionable && puedeEditar && (
        <div className="pointer-events-none absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-400 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          <Pencil className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}

interface PlanoMesasProps {
  mesas: Mesa[];
  pedidos: Pedido[];
  reservas: Reserva[];
  vacio?: string;
  /** Modo selector (ej. "Nuevo pedido"): las mesas libres/reservadas se vuelven elegibles. */
  seleccionadaId?: string;
  onSeleccionar?: (mesa: Mesa) => void;
  /** Modo administración (`/mesas`): clic para editar, ícono para eliminar. */
  puedeEditar?: boolean;
  puedeEliminar?: boolean;
  onEditar?: (mesa: Mesa) => void;
  onEliminar?: (mesa: Mesa) => void;
  /** Muestra el QR de autopedido de la mesa (solo en modo administración). */
  onVerQr?: (mesa: Mesa) => void;
}

/**
 * Plano visual de mesas agrupadas por salón, con su ocupación real (libre / ocupada / reservada)
 * en vez de una fila de tabla con texto. Se reutiliza tal cual entre `/mesas` (gestión) y el
 * selector de mesa de "Nuevo pedido" (elección) — el modo lo decide qué props se pasan, no dos
 * componentes distintos.
 */
export function PlanoMesas({
  mesas,
  pedidos,
  reservas,
  vacio = 'No hay mesas para mostrar',
  seleccionadaId,
  onSeleccionar,
  puedeEditar,
  puedeEliminar,
  onEditar,
  onEliminar,
  onVerQr,
}: PlanoMesasProps) {
  const seleccionable = !!onSeleccionar;

  if (mesas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-12 text-center text-sm text-zinc-500">
        {vacio}
      </div>
    );
  }

  const salones = new Map<string, { nombre: string; mesas: Mesa[] }>();
  for (const mesa of mesas) {
    const grupo = salones.get(mesa.salon.id) ?? { nombre: mesa.salon.nombre, mesas: [] };
    grupo.mesas.push(mesa);
    salones.set(mesa.salon.id, grupo);
  }
  const gruposOrdenados = Array.from(salones.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre),
  );

  let indiceGlobal = 0;

  return (
    <div className="flex flex-col gap-6">
      {gruposOrdenados.map((grupo) => (
        <div key={grupo.nombre}>
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            {grupo.nombre}
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
            {grupo.mesas
              .slice()
              .sort((a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true }))
              .map((mesa) => {
                const indice = indiceGlobal++;
                return (
                  <TarjetaMesa
                    key={mesa.id}
                    mesa={mesa}
                    indice={indice}
                    ocupacion={calcularOcupacionMesa(mesa, pedidos, reservas)}
                    seleccionable={seleccionable}
                    seleccionada={mesa.id === seleccionadaId}
                    onSeleccionar={onSeleccionar}
                    puedeEditar={puedeEditar}
                    puedeEliminar={puedeEliminar}
                    onEditar={onEditar}
                    onEliminar={onEliminar}
                    onVerQr={onVerQr}
                  />
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
