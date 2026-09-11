const CODIGO_PAIS_PERU = '51';

/**
 * Normaliza un teléfono guardado en Empresa (ej. "908713198", "+51 908 713 198") al formato
 * que espera wa.me: solo dígitos, con código de país. Un celular peruano tiene 9 dígitos y
 * empieza en "9"; si ya trae el 51 antepuesto, se respeta tal cual.
 */
export function numeroWhatsApp(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '');
  if (digitos.length === 9 && digitos.startsWith('9')) {
    return `${CODIGO_PAIS_PERU}${digitos}`;
  }
  return digitos;
}

/** Enlace `wa.me` con el mensaje ya cargado, listo para abrir en una pestaña nueva. */
export function enlaceWhatsApp(telefono: string, mensaje: string): string {
  return `https://wa.me/${numeroWhatsApp(telefono)}?text=${encodeURIComponent(mensaje)}`;
}

interface LineaMensajePedido {
  nombre: string;
  cantidad: number;
  subtotal: number;
  /** Indicación del cliente para ese plato ("sin cebolla"). */
  nota?: string;
}

export type ModoEntrega = 'recojo' | 'delivery';

export interface DatosEntrega {
  modo: ModoEntrega;
  /** A nombre de quién va el pedido. Opcional: si no lo llena, no se inventa una línea. */
  nombre?: string;
  /** Solo tiene sentido con `modo: 'delivery'`. */
  direccion?: string;
  /** Cualquier indicación general: hora de recojo, referencia de la casa, etc. */
  referencia?: string;
}

const ETIQUETA_MODO: Record<ModoEntrega, string> = {
  recojo: 'Recojo en el local',
  delivery: 'Delivery',
};

/**
 * Texto del pedido armado en la carta pública, listo para pegarse en el mensaje de WhatsApp.
 * Es una propuesta informal del cliente, no un comprobante — el restaurante la confirma por
 * ese mismo chat (nunca crea un `Pedido` real del sistema, ver `useBandejaPedido`).
 */
export function mensajePedido(
  nombreRestaurante: string,
  lineas: LineaMensajePedido[],
  formatearPrecio: (valor: number) => string,
  entrega?: DatosEntrega,
): string {
  const detalle = lineas
    .flatMap((linea) => {
      const fila = `• ${linea.cantidad}x ${linea.nombre} — ${formatearPrecio(linea.subtotal)}`;
      const nota = linea.nota?.trim();
      return nota ? [fila, `   ↳ ${nota}`] : [fila];
    })
    .join('\n');
  const total = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);

  // Solo se escriben los datos que el visitante realmente llenó: un bloque con "Nombre: —"
  // no ayuda a quien atiende el chat.
  const bloqueEntrega: string[] = [];
  if (entrega) {
    const nombre = entrega.nombre?.trim();
    const direccion = entrega.direccion?.trim();
    const referencia = entrega.referencia?.trim();
    bloqueEntrega.push(`Entrega: ${ETIQUETA_MODO[entrega.modo]}`);
    if (nombre) bloqueEntrega.push(`A nombre de: ${nombre}`);
    if (entrega.modo === 'delivery' && direccion) bloqueEntrega.push(`Dirección: ${direccion}`);
    if (referencia) bloqueEntrega.push(`Indicaciones: ${referencia}`);
  }

  return [
    `¡Hola ${nombreRestaurante}! Quisiera hacer este pedido:`,
    '',
    detalle,
    '',
    `Total estimado: ${formatearPrecio(total)}`,
    ...(bloqueEntrega.length > 0 ? ['', ...bloqueEntrega] : []),
    '',
    '(Enviado desde la carta digital)',
  ].join('\n');
}
