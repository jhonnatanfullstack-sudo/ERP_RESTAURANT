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
