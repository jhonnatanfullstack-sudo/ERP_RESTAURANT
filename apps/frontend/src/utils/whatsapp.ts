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

/** `mesa` se agrega solo al entrar desde un QR de mesa (`?mesa=<id>`, ver `Carta.tsx`): ahí la
 * entrega no se elige, ya se sabe dónde está sentado el cliente. */
export type ModoEntrega = 'recojo' | 'delivery' | 'mesa';

/** Lo que el cliente dice que va a usar para pagar — no es un cobro real, solo evita que quien
 * atienda el pedido tenga que preguntarlo de nuevo por chat (ver `Pedido.medioPagoPreferido`). */
export type MedioPagoPreferido = 'efectivo' | 'yape' | 'plin' | 'tarjeta';

export interface DatosEntrega {
  modo: ModoEntrega;
  /** A nombre de quién va el pedido. Opcional: si no lo llena, no se inventa una línea. */
  nombre?: string;
  /** Necesario para registrar un pedido real de recojo/delivery (`Pedido.contactoTelefono`);
   * no aplica en `modo: 'mesa'`. */
  telefono?: string;
  /** Solo tiene sentido con `modo: 'delivery'`. */
  direccion?: string;
  /** Cualquier indicación general: hora de recojo, referencia de la casa, etc. */
  referencia?: string;
  /** Presentes solo en `modo: 'mesa'`, tomados del QR escaneado. */
  mesaId?: string;
  mesaNumero?: string;
  medioPago?: MedioPagoPreferido;
  /** Solo con `medioPago: 'efectivo'`: con cuánto va a pagar, para calcular el vuelto. Texto
   * (no número) porque es lo que escribe el campo — se convierte recién al armar el pedido. */
  montoEfectivo?: string;
}

const ETIQUETA_MODO: Record<ModoEntrega, string> = {
  recojo: 'Recojo en el local',
  delivery: 'Delivery',
  mesa: 'En mi mesa',
};

const ETIQUETA_MEDIO_PAGO: Record<MedioPagoPreferido, string> = {
  efectivo: 'Efectivo',
  yape: 'Yape',
  plin: 'Plin',
  tarjeta: 'Tarjeta',
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
    const telefono = entrega.telefono?.trim();
    const direccion = entrega.direccion?.trim();
    const referencia = entrega.referencia?.trim();
    bloqueEntrega.push(`Entrega: ${ETIQUETA_MODO[entrega.modo]}`);
    if (nombre) bloqueEntrega.push(`A nombre de: ${nombre}`);
    if (telefono) bloqueEntrega.push(`Teléfono: ${telefono}`);
    if (entrega.modo === 'delivery' && direccion) bloqueEntrega.push(`Dirección: ${direccion}`);
    if (entrega.medioPago) {
      bloqueEntrega.push(`Pago: ${ETIQUETA_MEDIO_PAGO[entrega.medioPago]}`);
      const monto = entrega.medioPago === 'efectivo' ? entrega.montoEfectivo?.trim() : undefined;
      if (monto) bloqueEntrega.push(`Paga con: S/ ${monto} (indicar vuelto)`);
    }
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
