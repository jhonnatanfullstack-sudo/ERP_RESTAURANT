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

/** Convierte un ISO (UTC) a la forma "YYYY-MM-DDTHH:mm" que espera <input type="datetime-local"> en hora local. */
export function aInputDatetimeLocal(iso: string): string {
  const fecha = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}
