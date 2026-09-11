const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function urlImagen(imagenUrl: string | null): string | null {
  if (!imagenUrl) return null;
  return `${API_BASE_URL}${imagenUrl}`;
}

const formateadorSoles = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
});

export function formatearPrecio(precio: number): string {
  return formateadorSoles.format(precio);
}

/** Monto abreviado para ejes y espacios estrechos: "S/ 1.2k", "S/ 3.4M". */
export function formatearPrecioCompacto(valor: number): string {
  const absoluto = Math.abs(valor);
  if (absoluto >= 1_000_000) return `S/ ${(valor / 1_000_000).toFixed(1)}M`;
  if (absoluto >= 1_000) return `S/ ${(valor / 1_000).toFixed(absoluto >= 10_000 ? 0 : 1)}k`;
  return `S/ ${Math.round(valor)}`;
}

const formateadorNumero = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });

export function formatearNumero(valor: number): string {
  return formateadorNumero.format(valor);
}

const formateadorCantidad = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 });

/** Cantidad de inventario o de receta: hasta 3 decimales, la misma precisión que guardan las
 * columnas `numeric(10,3)` de `existencias` y `receta_insumos`. No usar `formatearNumero`
 * para esto — redondea a enteros y convierte "0.25 kg" en "0 kg". */
export function formatearCantidad(valor: number): string {
  return formateadorCantidad.format(valor);
}

const formateadorFechaHora = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatearFechaHora(iso: string): string {
  return formateadorFechaHora.format(new Date(iso));
}

const formateadorHora = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' });

export function formatearHora(iso: string): string {
  return formateadorHora.format(new Date(iso));
}

const formateadorFechaLarga = new Intl.DateTimeFormat('es-PE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatearFechaLarga(fecha: Date): string {
  const texto = formateadorFechaLarga.format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Nombre a mostrar de un cliente: razón social si es persona jurídica (RUC 20...), o
 * "nombres apellidos" en cualquier otro caso. Usar siempre esto en vez de leer
 * `cliente.nombres` directamente — un cliente persona jurídica no tiene nombres. */
export function nombreCliente(
  cliente: { nombres: string | null; apellidos: string | null; razonSocial: string | null } | null,
): string {
  if (!cliente) return '—';
  if (cliente.razonSocial) return cliente.razonSocial;
  return `${cliente.nombres ?? ''} ${cliente.apellidos ?? ''}`.trim() || '—';
}

/** Nombre a mostrar de la mesa de un pedido/venta: "Salón — Mesa N" o "Para llevar" cuando
 * no tiene mesa asignada. Usar siempre esto en vez de leer `mesa.numero` directamente — un
 * pedido "para llevar" no tiene mesa. */
export function nombreMesa(mesa: { salon: { nombre: string }; numero: string } | null): string {
  if (!mesa) return 'Para llevar';
  return `${mesa.salon.nombre} — Mesa ${mesa.numero}`;
}

/** Columna "Mesa"/"Origen" de una venta: distingue una venta directa (sin pedido de por
 * medio: no hay mesa que mostrar) de una venta facturada desde un pedido, que sí puede
 * tener mesa o ser "para llevar". */
export function origenVenta(venta: {
  pedido: { mesa: Parameters<typeof nombreMesa>[0] } | null;
}): string {
  if (!venta.pedido) return 'Venta directa';
  return nombreMesa(venta.pedido.mesa);
}

/** Dígitos del correlativo en el número de un comprobante (formato SUNAT: serie de 4 +
 * guion + correlativo de 8). Mismo valor que `utils/comprobante.ts` en el backend. */
export const DIGITOS_CORRELATIVO = 8;

/** Número completo de un comprobante: "B001-00000001". Usar siempre esto en vez de armar el
 * padding a mano, para que la lista de ventas, el detalle y el selector de talonarios
 * muestren exactamente el mismo formato. */
export function numeroComprobante(serie: string, numero: number): string {
  return `${serie}-${String(numero).padStart(DIGITOS_CORRELATIVO, '0')}`;
}

interface IdentidadPersona {
  nombres: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  razonSocial: string | null;
}

/** Nombre a mostrar de un personal: razón social si es persona jurídica (RUC 20...),
 * o "nombres apellidos" en cualquier otro caso. Usar siempre esto en vez de leer
 * `personal.nombres` directamente — un personal persona jurídica no tiene nombres. */
export function nombrePersonal(personal: IdentidadPersona | null | undefined): string {
  if (!personal) return '—';
  if (personal.razonSocial) return personal.razonSocial;
  return (
    `${personal.nombres ?? ''} ${personal.apellidoPaterno ?? ''} ${personal.apellidoMaterno ?? ''}`
      .replace(/\s+/g, ' ')
      .trim() || '—'
  );
}

/** Nombre breve para saludos y cabeceras: solo el nombre de pila (o la razón
 * social, que no se puede acortar). */
export function nombreCortoPersonal(personal: IdentidadPersona | null | undefined): string {
  if (!personal) return '—';
  return personal.razonSocial ?? personal.nombres ?? '—';
}

/** Iniciales para el avatar del Navbar, a partir del nombre a mostrar. */
export function inicialesPersonal(personal: IdentidadPersona | null | undefined): string {
  const palabras = nombrePersonal(personal).split(' ').filter(Boolean);
  if (palabras[0] === '—') return '?';
  return palabras
    .slice(0, 2)
    .map((palabra) => palabra[0])
    .join('')
    .toUpperCase();
}

/** Convierte un ISO (UTC) a la forma "YYYY-MM-DDTHH:mm" que espera <input type="datetime-local"> en hora local. */
export function aInputDatetimeLocal(iso: string): string {
  const fecha = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}
