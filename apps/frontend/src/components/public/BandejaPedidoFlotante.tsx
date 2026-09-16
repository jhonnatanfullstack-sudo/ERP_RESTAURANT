import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Banknote,
  Bike,
  CheckCircle2,
  CreditCard,
  Minus,
  NotebookPen,
  Plus,
  ShoppingBag,
  Smartphone,
  Store,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import * as pedidosService from '../../services/pedidos.service';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import { enlaceWhatsApp, mensajePedido } from '../../utils/whatsapp';
import { mensajeError } from '../../utils/errores';
import type { DatosEntrega, MedioPagoPreferido, ModoEntrega } from '../../utils/whatsapp';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

interface BandejaPedidoFlotanteProps {
  slug: string;
  items: ItemBandeja[];
  productos: Producto[];
  entrega: DatosEntrega;
  onCambiarCantidad: (productoId: string, cantidad: number) => void;
  onCambiarNota: (productoId: string, nota: string) => void;
  onCambiarEntrega: (cambios: Partial<DatosEntrega>) => void;
  onQuitar: (productoId: string) => void;
  onVaciar: () => void;
  nombreRestaurante: string;
  /** Sin teléfono configurado no se puede armar el enlace de WhatsApp — se oculta ese botón. */
  telefonoWhatsApp: string | null;
  /** QR de cobro subido en Configuración. `null` cuando el restaurante no configuró ese medio
   * — en ese caso no se muestra nada inventado, solo se oculta el bloque del QR. */
  qrPagoYape: string | null;
  qrPagoPlin: string | null;
}

const CLASE_CAMPO =
  'w-full rounded-xl border border-(--carta-borde) bg-(--carta-fondo) px-3 py-2.5 text-sm transition-colors placeholder:text-(--carta-suave) focus:border-(--carta-acento) focus:outline-none';

/** Borde rojo + mensaje bajo el campo cuando se intentó enviar sin llenarlo — ver
 * `intentoEnviar` más abajo. */
const CLASE_CAMPO_INVALIDO = 'border-red-400 focus:border-red-400';

const MODOS: Array<{ modo: ModoEntrega; etiqueta: string; icono: typeof Store }> = [
  { modo: 'recojo', etiqueta: 'Recojo', icono: Store },
  { modo: 'delivery', etiqueta: 'Delivery', icono: Bike },
];

const MODOS_PAGO: Array<{ medio: MedioPagoPreferido; etiqueta: string; icono: typeof Store }> = [
  { medio: 'efectivo', etiqueta: 'Efectivo', icono: Banknote },
  { medio: 'yape', etiqueta: 'Yape', icono: Smartphone },
  { medio: 'plin', etiqueta: 'Plin', icono: Smartphone },
  { medio: 'tarjeta', etiqueta: 'Tarjeta', icono: CreditCard },
];

/** Personalidad "Premium" (ver skill de motion design), la misma que `ModalPlatillo`: el
 * panel entra desde el borde —es de dónde "viene" el botón flotante que lo abre— y sale un
 * poco más rápido de lo que entró. */
const EASE_PREMIUM = [0.4, 0, 0.2, 1] as const;
const VARIANTES_FONDO_PANEL = {
  oculto: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: EASE_PREMIUM } },
  salida: { opacity: 0, transition: { duration: 0.22, ease: EASE_PREMIUM } },
};
const VARIANTES_PANEL = {
  oculto: { x: '100%' },
  visible: { x: 0, transition: { duration: 0.38, ease: EASE_PREMIUM } },
  salida: { x: '100%', transition: { duration: 0.26, ease: EASE_PREMIUM } },
};

/**
 * Botón flotante con el conteo del pedido que el cliente arma en la carta, y el panel
 * deslizable donde lo revisa antes de enviarlo. En mesa (`entrega.modo === 'mesa'`, llegado por
 * el QR de la mesa) y en recojo/delivery se puede enviar como un `Pedido` real del sistema
 * (`crearPedidoPublico`); en recojo/delivery además queda la opción de WhatsApp como
 * alternativa. Ver `hooks/useBandejaPedido.ts`.
 */
export function BandejaPedidoFlotante({
  slug,
  items,
  productos,
  entrega,
  onCambiarCantidad,
  onCambiarNota,
  onCambiarEntrega,
  onQuitar,
  onVaciar,
  nombreRestaurante,
  telefonoWhatsApp,
  qrPagoYape,
  qrPagoPlin,
}: BandejaPedidoFlotanteProps) {
  const [abierta, setAbierta] = useState(false);
  const [pedidoEnviado, setPedidoEnviado] = useState(false);
  // Código corto del pedido real creado (los primeros 8 caracteres del UUID): para que el
  // cliente tenga algo que mencionar si llama a preguntar por su pedido.
  const [codigoPedido, setCodigoPedido] = useState<string | null>(null);
  // Qué línea tiene el campo de nota desplegado. Solo una a la vez: con el campo siempre
  // visible en cada línea, un pedido de seis platos se vuelve un formulario largo.
  const [notaAbiertaId, setNotaAbiertaId] = useState<string | null>(null);
  // Se activa recién al primer intento de envío: antes de eso no tiene sentido marcar en rojo
  // un campo que el visitante todavía no tuvo oportunidad de llenar.
  const [intentoEnviar, setIntentoEnviar] = useState(false);
  // Sacude el botón de enviar cuando se lo toca sin completar los campos obligatorios — el
  // mismo patrón "error" de la skill de motion design (oscilación corta, sin rebote).
  const [sacudirEnvio, setSacudirEnvio] = useState(0);

  const lineas = items
    .map((item) => {
      const producto = productos.find((p) => p.id === item.productoId);
      if (!producto) return null;
      return {
        producto,
        cantidad: item.cantidad,
        nota: item.nota ?? '',
        subtotal: producto.precio * item.cantidad,
      };
    })
    .filter((linea): linea is NonNullable<typeof linea> => linea !== null);

  const totalItems = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);
  const total = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);

  // Rebote del contador cada vez que sube: feedback inmediato de "se agregó" sin necesitar
  // abrir el panel. `key` fuerza a React a reiniciar la animación en cada aumento (una clase
  // reaplicada sobre el mismo nodo no reinicia un keyframe ya corrido).
  const totalAnterior = useRef(totalItems);
  const [rebotes, setRebotes] = useState(0);
  useEffect(() => {
    if (totalItems > totalAnterior.current) setRebotes((valor) => valor + 1);
    totalAnterior.current = totalItems;
  }, [totalItems]);

  // Cierra el panel y, si se había enviado un pedido, limpia esa confirmación — para que la
  // próxima vez que se abra (con un carrito nuevo) no siga mostrando el aviso anterior.
  function cerrarPanel() {
    setAbierta(false);
    setPedidoEnviado(false);
    setCodigoPedido(null);
    setIntentoEnviar(false);
  }

  // Cerrar con Escape: el panel tapa la página entera y es la salida que el visitante espera.
  useEffect(() => {
    if (!abierta) return;
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') cerrarPanel();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierta]);

  const montoEfectivo = Number(entrega.montoEfectivo);
  const vuelto =
    entrega.medioPago === 'efectivo' &&
    entrega.montoEfectivo?.trim() &&
    !Number.isNaN(montoEfectivo)
      ? montoEfectivo - total
      : null;

  const enviarPedidoMutation = useMutation({
    mutationFn: () =>
      pedidosService.crearPedidoPublico(slug, {
        canalOrigen: entrega.modo === 'mesa' ? 'autopedido' : entrega.modo,
        mesaId: entrega.modo === 'mesa' ? entrega.mesaId : undefined,
        contactoNombre: entrega.nombre?.trim() || undefined,
        contactoTelefono: entrega.telefono?.trim() || undefined,
        direccionEntrega: entrega.modo === 'delivery' ? entrega.direccion?.trim() : undefined,
        medioPagoPreferido: entrega.medioPago,
        vueltoPara:
          entrega.medioPago === 'efectivo' && vuelto !== null && vuelto >= 0
            ? montoEfectivo
            : undefined,
        notas: entrega.referencia?.trim() || undefined,
        detalles: lineas.map((l) => ({
          productoId: l.producto.id,
          cantidad: l.cantidad,
          notas: l.nota || undefined,
        })),
      }),
    onSuccess: (pedido) => {
      setPedidoEnviado(true);
      setCodigoPedido(pedido.id.slice(0, 8).toUpperCase());
      onVaciar();
    },
  });

  // En recojo/delivery el pedido real exige nombre y teléfono (y dirección si es delivery) —
  // se valida acá para dar el mensaje antes de intentar el envío, no como un 400 del backend.
  const faltaNombre = entrega.modo !== 'mesa' && !entrega.nombre?.trim();
  const faltaTelefono = entrega.modo !== 'mesa' && !entrega.telefono?.trim();
  const faltaDireccion = entrega.modo === 'delivery' && !entrega.direccion?.trim();
  const faltaParaEnviar = faltaNombre || faltaTelefono || faltaDireccion;

  function manejarEnviar() {
    if (faltaParaEnviar) {
      setIntentoEnviar(true);
      setSacudirEnvio((valor) => valor + 1);
      return;
    }
    enviarPedidoMutation.mutate();
  }

  const enlaceEnviar = telefonoWhatsApp
    ? enlaceWhatsApp(
        telefonoWhatsApp,
        mensajePedido(
          nombreRestaurante,
          lineas.map((l) => ({
            nombre: l.producto.nombre,
            cantidad: l.cantidad,
            subtotal: l.subtotal,
            nota: l.nota,
          })),
          formatearPrecio,
          entrega,
        ),
      )
    : null;

  return (
    <>
      <AnimatePresence>
        {(totalItems > 0 || abierta) && (
          <motion.button
            type="button"
            onClick={() => setAbierta(true)}
            aria-label={`Ver mi pedido, ${totalItems} producto(s)`}
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 10 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="fixed right-5 bottom-5 z-40 flex items-center gap-2.5 rounded-full bg-(--carta-texto) py-3.5 pr-5 pl-4 text-(--carta-fondo) shadow-xl shadow-black/20 sm:right-8 sm:bottom-8"
          >
            <span className="relative flex h-6 w-6 items-center justify-center">
              <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
              {totalItems > 0 && (
                <span
                  key={rebotes}
                  className="animar-rebote absolute -top-2.5 -right-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--carta-acento) px-1 text-[11px] font-bold text-(--carta-acento-contraste) ring-2 ring-(--carta-texto)"
                >
                  {totalItems}
                </span>
              )}
            </span>
            <span className="text-sm font-semibold">Mi pedido</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {abierta && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.button
              type="button"
              aria-label="Cerrar mi pedido"
              onClick={cerrarPanel}
              variants={VARIANTES_FONDO_PANEL}
              initial="oculto"
              animate="visible"
              exit="salida"
              className="absolute inset-0 cursor-default bg-zinc-900/50 backdrop-blur-sm"
            />
            <motion.div
              variants={VARIANTES_PANEL}
              initial="oculto"
              animate="visible"
              exit="salida"
              className="relative flex h-full w-full max-w-sm flex-col bg-(--carta-superficie) shadow-2xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-(--carta-borde) px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold text-(--carta-texto)">Mi pedido</h2>
                  <p className="text-xs text-(--carta-suave)">
                    {pedidoEnviado
                      ? 'Pedido enviado'
                      : totalItems === 0
                        ? 'Aún no agregaste nada'
                        : `${totalItems} producto${totalItems === 1 ? '' : 's'} seleccionado${totalItems === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cerrarPanel}
                  aria-label="Cerrar"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-(--carta-suave) transition-colors hover:bg-(--carta-elevado) hover:text-(--carta-suave)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {pedidoEnviado ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.75 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, ease: EASE_PREMIUM }}
                    >
                      <CheckCircle2 className="h-12 w-12 text-emerald-500" strokeWidth={1.5} />
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: EASE_PREMIUM, delay: 0.15 }}
                      className="flex flex-col items-center gap-3"
                    >
                      <p className="text-base font-semibold text-(--carta-texto)">
                        {entrega.modo === 'mesa'
                          ? '¡Pedido enviado a tu mesa!'
                          : '¡Pedido enviado!'}
                      </p>
                      <p className="max-w-56 text-sm text-(--carta-suave)">
                        {entrega.modo === 'mesa'
                          ? 'El mozo lo va a confirmar en un momento.'
                          : `${nombreRestaurante} lo va a confirmar en un momento.`}
                      </p>
                      {codigoPedido && (
                        <p className="rounded-lg bg-(--carta-elevado) px-3 py-1.5 font-mono text-xs font-semibold tracking-wider text-(--carta-texto)">
                          Código: #{codigoPedido}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={cerrarPanel}
                        className="mt-2 rounded-xl border border-(--carta-borde) px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-(--carta-elevado)"
                      >
                        Cerrar
                      </button>
                    </motion.div>
                  </div>
                ) : lineas.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-(--carta-suave)">
                    <ShoppingBag className="h-10 w-10" strokeWidth={1.25} />
                    <p className="text-sm">
                      Toca el botón <span className="font-medium">+</span> en los platos que te
                      gusten.
                    </p>
                  </div>
                ) : (
                  <>
                    <ul className="flex flex-col gap-3">
                      {lineas.map(({ producto, cantidad, nota, subtotal }) => {
                        const imagen = urlImagen(producto.imagenUrl);
                        const notaAbierta = notaAbiertaId === producto.id;
                        return (
                          <li
                            key={producto.id}
                            className="rounded-2xl bg-(--carta-elevado)/60 p-3 ring-1 ring-(--carta-borde)"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-(--carta-elevado)">
                                {imagen && (
                                  <img
                                    src={imagen}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-(--carta-texto)">
                                  {producto.nombre}
                                </p>
                                <p className="text-xs text-(--carta-suave)">
                                  {formatearPrecio(subtotal)}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onCambiarCantidad(producto.id, cantidad - 1)}
                                  aria-label={`Quitar una unidad de ${producto.nombre}`}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-(--carta-borde) text-(--carta-suave) transition-colors hover:bg-(--carta-elevado)"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-5 text-center text-sm font-semibold tabular-nums">
                                  {cantidad}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => onCambiarCantidad(producto.id, cantidad + 1)}
                                  aria-label={`Agregar una unidad más de ${producto.nombre}`}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border border-(--carta-borde) text-(--carta-suave) transition-colors hover:bg-(--carta-elevado)"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onQuitar(producto.id)}
                                  aria-label={`Quitar ${producto.nombre} del pedido`}
                                  className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-(--carta-suave) transition-colors hover:text-red-500"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Nota por plato: lo que en el mostrador se diría de viva voz
                              ("sin cebolla"). Va al mensaje bajo su línea. */}
                            <div className="mt-2 pl-17">
                              {notaAbierta ? (
                                <input
                                  type="text"
                                  autoFocus
                                  value={nota}
                                  maxLength={120}
                                  onChange={(evento) =>
                                    onCambiarNota(producto.id, evento.target.value)
                                  }
                                  onBlur={() => setNotaAbiertaId(null)}
                                  onKeyDown={(evento) => {
                                    if (evento.key === 'Enter' || evento.key === 'Escape') {
                                      evento.currentTarget.blur();
                                    }
                                  }}
                                  placeholder="Sin cebolla, poca sal…"
                                  aria-label={`Nota para ${producto.nombre}`}
                                  className={`${CLASE_CAMPO} py-1.5 text-xs`}
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setNotaAbiertaId(producto.id)}
                                  className="flex max-w-full items-center gap-1.5 text-xs text-(--carta-suave) transition-colors hover:text-(--carta-acento)"
                                >
                                  <NotebookPen className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                                  <span className="truncate">
                                    {nota.trim() || 'Agregar una indicación'}
                                  </span>
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {entrega.modo === 'mesa' ? (
                      // Llegó por el QR de una mesa: no hay nada que elegir, ya se sabe dónde
                      // está sentado.
                      <div className="mt-7 border-t border-(--carta-borde) pt-5">
                        <div className="flex items-center gap-2 rounded-xl border border-(--carta-acento) bg-(--carta-acento-tenue) px-3.5 py-2.5 text-sm font-semibold text-(--carta-acento)">
                          <UtensilsCrossed className="h-4 w-4" strokeWidth={2} />
                          Pedido para Mesa {entrega.mesaNumero}
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                          <input
                            type="text"
                            value={entrega.nombre ?? ''}
                            maxLength={80}
                            onChange={(evento) => onCambiarEntrega({ nombre: evento.target.value })}
                            placeholder="A nombre de quién (opcional)"
                            aria-label="A nombre de quién"
                            className={CLASE_CAMPO}
                          />
                          <input
                            type="text"
                            value={entrega.referencia ?? ''}
                            maxLength={160}
                            onChange={(evento) =>
                              onCambiarEntrega({ referencia: evento.target.value })
                            }
                            placeholder="Alguna indicación (opcional)"
                            aria-label="Indicaciones adicionales"
                            className={CLASE_CAMPO}
                          />
                        </div>
                      </div>
                    ) : (
                      // Cómo lo quiere recibir: son los datos que quien atiende el pedido iba a
                      // tener que preguntar igual.
                      <div className="mt-7 border-t border-(--carta-borde) pt-5">
                        <p className="text-sm font-semibold text-(--carta-texto)">
                          ¿Cómo lo quieres recibir?
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {MODOS.map(({ modo, etiqueta, icono: Icono }) => {
                            const activo = entrega.modo === modo;
                            return (
                              <button
                                key={modo}
                                type="button"
                                aria-pressed={activo}
                                onClick={() => onCambiarEntrega({ modo })}
                                className={`relative flex items-center justify-center gap-2 overflow-hidden rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                                  activo
                                    ? 'border-(--carta-acento) text-(--carta-acento)'
                                    : 'border-(--carta-borde) text-(--carta-suave) hover:bg-(--carta-elevado)'
                                }`}
                              >
                                {/* Mismo truco que la píldora de categorías de la carta: un único
                                    elemento con `layoutId` se desliza de un botón a otro. */}
                                {activo && (
                                  <motion.span
                                    layoutId="carta-modo-entrega-activo"
                                    className="absolute inset-0 bg-(--carta-acento-tenue)"
                                    transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                                  />
                                )}
                                <Icono className="relative h-4 w-4" strokeWidth={2} />
                                <span className="relative">{etiqueta}</span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="mt-3 flex flex-col gap-2">
                          <div>
                            <input
                              type="text"
                              value={entrega.nombre ?? ''}
                              maxLength={80}
                              onChange={(evento) =>
                                onCambiarEntrega({ nombre: evento.target.value })
                              }
                              placeholder="Tu nombre"
                              aria-label="Tu nombre"
                              className={`${CLASE_CAMPO} ${intentoEnviar && faltaNombre ? CLASE_CAMPO_INVALIDO : ''}`}
                            />
                            {intentoEnviar && faltaNombre && (
                              <p className="mt-1 text-xs text-red-500">Falta tu nombre.</p>
                            )}
                          </div>
                          <div>
                            <input
                              type="tel"
                              value={entrega.telefono ?? ''}
                              maxLength={20}
                              onChange={(evento) =>
                                onCambiarEntrega({ telefono: evento.target.value })
                              }
                              placeholder="Tu teléfono"
                              aria-label="Tu teléfono"
                              className={`${CLASE_CAMPO} ${intentoEnviar && faltaTelefono ? CLASE_CAMPO_INVALIDO : ''}`}
                            />
                            {intentoEnviar && faltaTelefono && (
                              <p className="mt-1 text-xs text-red-500">Falta tu teléfono.</p>
                            )}
                          </div>
                          {entrega.modo === 'delivery' && (
                            <div>
                              <input
                                type="text"
                                value={entrega.direccion ?? ''}
                                maxLength={160}
                                onChange={(evento) =>
                                  onCambiarEntrega({ direccion: evento.target.value })
                                }
                                placeholder="Dirección de entrega"
                                aria-label="Dirección de entrega"
                                className={`${CLASE_CAMPO} ${intentoEnviar && faltaDireccion ? CLASE_CAMPO_INVALIDO : ''}`}
                              />
                              {intentoEnviar && faltaDireccion && (
                                <p className="mt-1 text-xs text-red-500">Falta la dirección.</p>
                              )}
                            </div>
                          )}
                          <input
                            type="text"
                            value={entrega.referencia ?? ''}
                            maxLength={160}
                            onChange={(evento) =>
                              onCambiarEntrega({ referencia: evento.target.value })
                            }
                            placeholder={
                              entrega.modo === 'delivery'
                                ? 'Referencia (opcional)'
                                : 'Hora de recojo (opcional)'
                            }
                            aria-label="Indicaciones adicionales"
                            className={CLASE_CAMPO}
                          />
                        </div>
                      </div>
                    )}

                    {/* Medio de pago: aplica a los tres modos (recojo, delivery y mesa) — es un
                        dato que quien atiende el pedido termina preguntando de todas formas. */}
                    <div className="mt-7 border-t border-(--carta-borde) pt-5">
                      <p className="text-sm font-semibold text-(--carta-texto)">
                        ¿Cómo vas a pagar?{' '}
                        <span className="font-normal text-(--carta-suave)">(opcional)</span>
                      </p>

                      <div className="mt-3 grid grid-cols-4 gap-2">
                        {MODOS_PAGO.map(({ medio, etiqueta, icono: Icono }) => {
                          const activo = entrega.medioPago === medio;
                          return (
                            <button
                              key={medio}
                              type="button"
                              aria-pressed={activo}
                              onClick={() =>
                                onCambiarEntrega({ medioPago: activo ? undefined : medio })
                              }
                              className={`relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                                activo
                                  ? 'border-(--carta-acento) text-(--carta-acento)'
                                  : 'border-(--carta-borde) text-(--carta-suave) hover:bg-(--carta-elevado)'
                              }`}
                            >
                              {activo && (
                                <motion.span
                                  layoutId="carta-medio-pago-activo"
                                  className="absolute inset-0 bg-(--carta-acento-tenue)"
                                  transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                                />
                              )}
                              <Icono className="relative h-4 w-4" strokeWidth={2} />
                              <span className="relative">{etiqueta}</span>
                            </button>
                          );
                        })}
                      </div>

                      <AnimatePresence initial={false} mode="wait">
                        {entrega.medioPago === 'efectivo' && (
                          <motion.div
                            key="efectivo"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.22, ease: EASE_PREMIUM }}
                            className="mt-3"
                          >
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              value={entrega.montoEfectivo ?? ''}
                              onChange={(evento) =>
                                onCambiarEntrega({ montoEfectivo: evento.target.value })
                              }
                              placeholder="¿Con cuánto vas a pagar? (opcional)"
                              aria-label="Con cuánto vas a pagar"
                              className={CLASE_CAMPO}
                            />
                            {vuelto !== null && (
                              <p
                                className={`mt-1.5 text-xs ${vuelto >= 0 ? 'text-(--carta-suave)' : 'text-red-500'}`}
                              >
                                {vuelto >= 0
                                  ? `Tu vuelto sería aprox. ${formatearPrecio(vuelto)}.`
                                  : 'Ese monto es menor al total del pedido.'}
                              </p>
                            )}
                          </motion.div>
                        )}

                        {(entrega.medioPago === 'yape' || entrega.medioPago === 'plin') &&
                          (() => {
                            const qr =
                              entrega.medioPago === 'yape'
                                ? urlImagen(qrPagoYape)
                                : urlImagen(qrPagoPlin);
                            if (!qr) return null;
                            return (
                              <motion.div
                                key={entrega.medioPago}
                                initial={{ opacity: 0, y: -6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.22, ease: EASE_PREMIUM }}
                                className="mt-3 flex flex-col items-center gap-2"
                              >
                                <img
                                  src={qr}
                                  alt={`QR de pago ${entrega.medioPago === 'yape' ? 'Yape' : 'Plin'}`}
                                  className="h-36 w-36 rounded-xl border border-(--carta-borde) object-contain p-2"
                                />
                                <p className="text-center text-xs text-(--carta-suave)">
                                  Escanea para pagar {formatearPrecio(total)}
                                </p>
                              </motion.div>
                            );
                          })()}
                      </AnimatePresence>
                    </div>
                  </>
                )}
              </div>

              {!pedidoEnviado && lineas.length > 0 && (
                <div className="shrink-0 border-t border-(--carta-borde) px-5 py-4">
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="text-(--carta-suave)">Total estimado</span>
                    <span className="text-lg font-bold text-(--carta-texto)">
                      {formatearPrecio(total)}
                    </span>
                  </div>

                  <motion.button
                    type="button"
                    disabled={enviarPedidoMutation.isPending}
                    onClick={manejarEnviar}
                    animate={sacudirEnvio > 0 ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                    // `key` fuerza a reiniciar la animación en cada intento fallido — sin esto,
                    // sacudir dos veces seguidas con el mismo arreglo de valores no dispara nada.
                    key={sacudirEnvio}
                    transition={{ duration: 0.4, ease: 'easeInOut' }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-(--carta-acento) py-3 text-sm font-bold text-(--carta-acento-contraste) shadow-sm transition-transform hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {enviarPedidoMutation.isPending
                      ? 'Enviando…'
                      : entrega.modo === 'mesa'
                        ? 'Enviar pedido a cocina'
                        : 'Enviar pedido'}
                  </motion.button>
                  {enviarPedidoMutation.isError && (
                    <p className="mt-1.5 text-center text-xs text-red-500">
                      {mensajeError(enviarPedidoMutation.error, 'No se pudo enviar el pedido')}
                    </p>
                  )}

                  {entrega.modo !== 'mesa' && enlaceEnviar && (
                    <a
                      href={enlaceEnviar}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-(--carta-borde) py-2.5 text-sm font-semibold transition-colors hover:bg-(--carta-elevado)"
                    >
                      O envíalo por WhatsApp
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={onVaciar}
                    className="mt-2 w-full text-center text-xs font-medium text-(--carta-suave) transition-colors hover:text-red-500"
                  >
                    Vaciar pedido
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
