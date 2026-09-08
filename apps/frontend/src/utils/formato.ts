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

const formateadorFechaHora = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatearFechaHora(iso: string): string {
  return formateadorFechaHora.format(new Date(iso));
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

/** Convierte un ISO (UTC) a la forma "YYYY-MM-DDTHH:mm" que espera <input type="datetime-local"> en hora local. */
export function aInputDatetimeLocal(iso: string): string {
  const fecha = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
}
