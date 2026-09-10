import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { formatearPrecio, urlImagen } from '../../utils/formato';
import { enlaceWhatsApp, mensajePedido } from '../../utils/whatsapp';
import type { ItemBandeja } from '../../hooks/useBandejaPedido';
import type { Producto } from '../../types/api';

interface BandejaPedidoFlotanteProps {
  items: ItemBandeja[];
  productos: Producto[];
  onCambiarCantidad: (productoId: string, cantidad: number) => void;
  onQuitar: (productoId: string) => void;
  onVaciar: () => void;
  nombreRestaurante: string;
  /** Sin teléfono configurado no se puede armar el enlace de WhatsApp — se oculta ese botón. */
  telefonoWhatsApp: string | null;
}

/**
 * Botón flotante con el conteo del pedido informal que el cliente arma en la carta, y el
 * panel deslizable donde lo revisa antes de enviarlo por WhatsApp. Nunca toca el backend:
 * es solo un borrador de mensaje (ver `hooks/useBandejaPedido.ts`).
 */
export function BandejaPedidoFlotante({
  items,
  productos,
  onCambiarCantidad,
  onQuitar,
  onVaciar,
  nombreRestaurante,
  telefonoWhatsApp,
}: BandejaPedidoFlotanteProps) {
  const [abierta, setAbierta] = useState(false);

  const lineas = items
    .map((item) => {
      const producto = productos.find((p) => p.id === item.productoId);
      if (!producto) return null;
      return { producto, cantidad: item.cantidad, subtotal: producto.precio * item.cantidad };
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

  const enlaceEnviar = telefonoWhatsApp
    ? enlaceWhatsApp(
        telefonoWhatsApp,
        mensajePedido(
          nombreRestaurante,
          lineas.map((l) => ({
            nombre: l.producto.nombre,
            cantidad: l.cantidad,
            subtotal: l.subtotal,
          })),
          formatearPrecio,
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
                    Toca <span className="font-medium text-(--carta-suave)">"Agregar a mi pedido"</span> en
                    los platillos que te gusten.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-4">
                  {lineas.map(({ producto, cantidad, subtotal }) => {
                    const imagen = urlImagen(producto.imagenUrl);
                    return (
                      <li key={producto.id} className="flex items-center gap-3">
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
                          <p className="text-xs text-(--carta-suave)">{formatearPrecio(subtotal)}</p>
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {lineas.length > 0 && (
              <div className="shrink-0 border-t border-(--carta-borde) px-5 py-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-(--carta-suave)">Total estimado</span>
                  <span className="text-lg font-bold text-(--carta-texto)">{formatearPrecio(total)}</span>
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
