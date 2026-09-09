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
}

/**
 * Texto del pedido armado en la carta pública, listo para pegarse en el mensaje de WhatsApp.
 * Es una propuesta informal del cliente, no un comprobante — el restaurante la confirma por
 * ese mismo chat (nunca crea un `Pedido` real del sistema, ver `useBandejaPedido`).
 */
export function mensajePedido(
  nombreRestaurante: string,
  lineas: LineaMensajePedido[],
  formatearPrecio: (valor: number) => string,
): string {
  const detalle = lineas
    .map((linea) => `• ${linea.cantidad}x ${linea.nombre} — ${formatearPrecio(linea.subtotal)}`)
    .join('\n');
  const total = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);

  return [
    `¡Hola ${nombreRestaurante}! Quisiera hacer este pedido:`,
    '',
    detalle,
    '',
    `Total estimado: ${formatearPrecio(total)}`,
    '',
    '(Enviado desde la carta digital)',
  ].join('\n');
}
