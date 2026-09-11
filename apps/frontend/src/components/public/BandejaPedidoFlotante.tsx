import { useEffect, useRef, useState } from 'react';
import { Bike, Minus, NotebookPen, Plus, ShoppingBag, Store, Trash2, X } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import { enlaceWhatsApp, mensajePedido } from '../../utils/whatsapp';
import type { DatosEntrega, ModoEntrega } from '../../utils/whatsapp';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

interface BandejaPedidoFlotanteProps {
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
}

const CLASE_CAMPO =
  'w-full rounded-xl border border-(--carta-borde) bg-(--carta-fondo) px-3 py-2.5 text-sm transition-colors placeholder:text-(--carta-suave) focus:border-(--carta-acento) focus:outline-none';

const MODOS: Array<{ modo: ModoEntrega; etiqueta: string; icono: typeof Store }> = [
  { modo: 'recojo', etiqueta: 'Recojo', icono: Store },
  { modo: 'delivery', etiqueta: 'Delivery', icono: Bike },
];

/**
 * Botón flotante con el conteo del pedido informal que el cliente arma en la carta, y el
 * panel deslizable donde lo revisa antes de enviarlo por WhatsApp. Nunca toca el backend:
 * es solo un borrador de mensaje (ver `hooks/useBandejaPedido.ts`).
 */
export function BandejaPedidoFlotante({
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
}: BandejaPedidoFlotanteProps) {
  const [abierta, setAbierta] = useState(false);
  // Qué línea tiene el campo de nota desplegado. Solo una a la vez: con el campo siempre
  // visible en cada línea, un pedido de seis platos se vuelve un formulario largo.
  const [notaAbiertaId, setNotaAbiertaId] = useState<string | null>(null);

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

  // Cerrar con Escape: el panel tapa la página entera y es la salida que el visitante espera.
  useEffect(() => {
    if (!abierta) return;
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierta(false);
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierta]);

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

  if (totalItems === 0 && !abierta) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label={`Ver mi pedido, ${totalItems} producto(s)`}
        className="animate-scale-in fixed right-5 bottom-5 z-40 flex items-center gap-2.5 rounded-full bg-(--carta-texto) py-3.5 pr-5 pl-4 text-(--carta-fondo) shadow-xl shadow-black/20 transition-transform hover:scale-105 active:scale-95 sm:right-8 sm:bottom-8"
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
      </button>

      {abierta && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Cerrar mi pedido"
            onClick={() => setAbierta(false)}
            className="animate-fade-in absolute inset-0 cursor-default bg-zinc-900/50 backdrop-blur-sm"
          />
          <div className="animar-bandeja relative flex h-full w-full max-w-sm flex-col bg-(--carta-superficie) shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-(--carta-borde) px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-(--carta-texto)">Mi pedido</h2>
                <p className="text-xs text-(--carta-suave)">
                  {totalItems === 0
                    ? 'Aún no agregaste nada'
                    : `${totalItems} producto${totalItems === 1 ? '' : 's'} seleccionado${totalItems === 1 ? '' : 's'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbierta(false)}
                aria-label="Cerrar"
                className="flex h-9 w-9 items-center justify-center rounded-full text-(--carta-suave) transition-colors hover:bg-(--carta-elevado) hover:text-(--carta-suave)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {lineas.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-(--carta-suave)">
                  <ShoppingBag className="h-10 w-10" strokeWidth={1.25} />
                  <p className="text-sm">
                    Toca el botón <span className="font-medium">+</span> en los platos que te
                    gusten.
                  </p>
                </div>
              ) : (
                <>
                  <ul className="flex flex-col gap-4">
                    {lineas.map(({ producto, cantidad, nota, subtotal }) => {
                      const imagen = urlImagen(producto.imagenUrl);
                      const notaAbierta = notaAbiertaId === producto.id;
                      return (
                        <li key={producto.id}>
                          <div className="flex items-center gap-3">
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-(--carta-elevado)">
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

                  {/* Cómo lo quiere recibir: son los datos que quien atiende el chat iba a
                      tener que preguntar igual. */}
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
                            className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                              activo
                                ? 'border-(--carta-acento) bg-(--carta-acento-tenue) text-(--carta-acento)'
                                : 'border-(--carta-borde) text-(--carta-suave) hover:bg-(--carta-elevado)'
                            }`}
                          >
                            <Icono className="h-4 w-4" strokeWidth={2} />
                            {etiqueta}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      <input
                        type="text"
                        value={entrega.nombre ?? ''}
                        maxLength={80}
                        onChange={(evento) => onCambiarEntrega({ nombre: evento.target.value })}
                        placeholder="Tu nombre"
                        aria-label="Tu nombre"
                        className={CLASE_CAMPO}
                      />
                      {entrega.modo === 'delivery' && (
                        <input
                          type="text"
                          value={entrega.direccion ?? ''}
                          maxLength={160}
                          onChange={(evento) =>
                            onCambiarEntrega({ direccion: evento.target.value })
                          }
                          placeholder="Dirección de entrega"
                          aria-label="Dirección de entrega"
                          className={CLASE_CAMPO}
                        />
                      )}
                      <input
                        type="text"
                        value={entrega.referencia ?? ''}
                        maxLength={160}
                        onChange={(evento) => onCambiarEntrega({ referencia: evento.target.value })}
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
                </>
              )}
            </div>

            {lineas.length > 0 && (
              <div className="shrink-0 border-t border-(--carta-borde) px-5 py-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-(--carta-suave)">Total estimado</span>
                  <span className="text-lg font-bold text-(--carta-texto)">
                    {formatearPrecio(total)}
                  </span>
                </div>
                {enlaceEnviar ? (
                  <a
                    href={enlaceEnviar}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-bold text-white shadow-sm transition-transform hover:brightness-95 active:scale-[0.98]"
                  >
                    Enviar pedido por WhatsApp
                  </a>
                ) : (
                  <p className="text-center text-xs text-(--carta-suave)">
                    Comunícate con el restaurante para completar tu pedido.
                  </p>
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
          </div>
        </div>
      )}
    </>
  );
}
