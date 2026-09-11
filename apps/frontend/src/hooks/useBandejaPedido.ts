import { useEffect, useState } from 'react';
import type { DatosEntrega, ModoEntrega } from '../utils/whatsapp';

const CLAVE_ALMACENAMIENTO = 'restaurant-erp:carta-bandeja';
const CLAVE_ENTREGA = 'restaurant-erp:carta-entrega';

export interface ItemBandeja {
  productoId: string;
  cantidad: number;
  /** Indicación del cliente para ese plato ("sin cebolla", "término medio"). Viaja en el
   * mensaje de WhatsApp; el restaurante la confirma por el mismo chat. */
  nota?: string;
}

const ENTREGA_VACIA: DatosEntrega = { modo: 'recojo', nombre: '', direccion: '', referencia: '' };

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
        typeof (item as ItemBandeja).cantidad === 'number' &&
        // `nota` es opcional: se acepta ausente, pero no de otro tipo (un guardado viejo o
        // manipulado no debe terminar pegando un objeto dentro del mensaje de WhatsApp).
        ['undefined', 'string'].includes(typeof (item as ItemBandeja).nota),
    );
  } catch {
    return [];
  }
}

function leerEntrega(): DatosEntrega {
  try {
    const guardado = localStorage.getItem(CLAVE_ENTREGA);
    if (!guardado) return ENTREGA_VACIA;
    const datos = JSON.parse(guardado) as Partial<DatosEntrega> | null;
    if (typeof datos !== 'object' || datos === null) return ENTREGA_VACIA;
    const modo: ModoEntrega = datos.modo === 'delivery' ? 'delivery' : 'recojo';
    const texto = (valor: unknown) => (typeof valor === 'string' ? valor : '');
    return {
      modo,
      nombre: texto(datos.nombre),
      direccion: texto(datos.direccion),
      referencia: texto(datos.referencia),
    };
  } catch {
    return ENTREGA_VACIA;
  }
}

function guardar(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // almacenamiento no disponible (modo privado, etc.): la selección solo dura la sesión
  }
}

/**
 * "Mi pedido" de la carta pública: una selección informal que el cliente arma para enviar
 * por WhatsApp — nunca crea un `Pedido` real del sistema (eso requiere una mesa/mesero y
 * pasar por cocina). Se persiste en `localStorage` (por navegador, nunca llega a Claude ni
 * a otros visitantes) para que sobreviva un refresco de página mientras el cliente decide.
 *
 * Guarda también cómo quiere recibirlo (recojo o delivery, a nombre de quién, dirección):
 * son los datos que quien atiende el chat iba a tener que preguntar de todas formas.
 */
export function useBandejaPedido() {
  const [items, setItems] = useState<ItemBandeja[]>(() => leerAlmacenamiento());
  const [entrega, setEntrega] = useState<DatosEntrega>(() => leerEntrega());

  useEffect(() => guardar(CLAVE_ALMACENAMIENTO, items), [items]);
  useEffect(() => guardar(CLAVE_ENTREGA, entrega), [entrega]);

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

  /** Guarda el texto tal cual lo escribe el visitante — recortarlo acá impediría escribir un
   * espacio. Se limpia al armar el mensaje (`utils/whatsapp.ts`). Una nota vacía se elimina
   * en vez de quedar como cadena vacía. */
  function cambiarNota(productoId: string, nota: string) {
    setItems((previo) =>
      previo.map((item) =>
        item.productoId === productoId
          ? {
              productoId: item.productoId,
              cantidad: item.cantidad,
              ...(nota ? { nota } : {}),
            }
          : item,
      ),
    );
  }

  function cambiarEntrega(cambios: Partial<DatosEntrega>) {
    setEntrega((previo) => ({ ...previo, ...cambios }));
  }

  function quitar(productoId: string) {
    setItems((previo) => previo.filter((item) => item.productoId !== productoId));
  }

  function vaciar() {
    setItems([]);
  }

  const totalItems = items.reduce((suma, item) => suma + item.cantidad, 0);

  return {
    items,
    entrega,
    agregar,
    cambiarCantidad,
    cambiarNota,
    cambiarEntrega,
    quitar,
    vaciar,
    totalItems,
  };
}
