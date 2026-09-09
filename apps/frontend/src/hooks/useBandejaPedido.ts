import { useEffect, useState } from 'react';

const CLAVE_ALMACENAMIENTO = 'restaurant-erp:carta-bandeja';

export interface ItemBandeja {
  productoId: string;
  cantidad: number;
}

function leerAlmacenamiento(): ItemBandeja[] {
  try {
    const guardado = localStorage.getItem(CLAVE_ALMACENAMIENTO);
    if (!guardado) return [];
    const datos = JSON.parse(guardado) as unknown;
    if (!Array.isArray(datos)) return [];
    return datos.filter(
      (item): item is ItemBandeja =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ItemBandeja).productoId === 'string' &&
        typeof (item as ItemBandeja).cantidad === 'number',
    );
  } catch {
    return [];
  }
}

/**
 * "Mi pedido" de la carta pública: una selección informal que el cliente arma para enviar
 * por WhatsApp — nunca crea un `Pedido` real del sistema (eso requiere una mesa/mesero y
 * pasar por cocina). Se persiste en `localStorage` (por navegador, nunca llega a Claude ni
 * a otros visitantes) para que sobreviva un refresco de página mientras el cliente decide.
 */
export function useBandejaPedido() {
  const [items, setItems] = useState<ItemBandeja[]>(() => leerAlmacenamiento());

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify(items));
    } catch {
      // almacenamiento no disponible (modo privado, etc.): la selección solo dura la sesión
    }
  }, [items]);

  function agregar(productoId: string, cantidad = 1) {
    setItems((previo) => {
      const indice = previo.findIndex((item) => item.productoId === productoId);
      if (indice === -1) return [...previo, { productoId, cantidad }];
      const copia = [...previo];
      copia[indice] = { ...copia[indice], cantidad: copia[indice].cantidad + cantidad };
      return copia;
    });
  }

  function cambiarCantidad(productoId: string, cantidad: number) {
    if (cantidad <= 0) {
      quitar(productoId);
      return;
    }
    setItems((previo) =>
      previo.map((item) => (item.productoId === productoId ? { ...item, cantidad } : item)),
    );
  }

  function quitar(productoId: string) {
    setItems((previo) => previo.filter((item) => item.productoId !== productoId));
  }

  function vaciar() {
    setItems([]);
  }

  const totalItems = items.reduce((suma, item) => suma + item.cantidad, 0);

  return { items, agregar, cambiarCantidad, quitar, vaciar, totalItems };
}
