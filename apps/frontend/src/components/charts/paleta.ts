/**
 * Paleta de los gráficos del sistema.
 *
 * El orden es FIJO: el color se asigna por posición y no se recicla ni se
 * reordena al filtrar, de modo que una serie conserva siempre su color.
 * Los valores fueron validados en espacio OKLab (banda de luminosidad, piso de
 * croma, separación bajo protanopia/deuteranopia y contraste >= 3:1 sobre fondo
 * blanco), por lo que no deben cambiarse "a ojo".
 */
export const PALETA_CATEGORICA = [
  '#2563eb', // blue-600
  '#ea580c', // orange-600
  '#0891b2', // cyan-600
  '#db2777', // pink-600
  '#65a30d', // lime-600
  '#7c3aed', // violet-600
] as const;

/** Serie única: naranja de marca. */
export const COLOR_MARCA = '#ea580c';
/** Superficie de las tarjetas: separa marcas contiguas con 2px de aire. */
export const COLOR_SUPERFICIE = '#ffffff';
/** Rejilla y pistas (zinc-100): siempre por detrás del dato. */
export const COLOR_REJILLA = '#f4f4f5';
/** Texto de ejes (zinc-400). */
export const COLOR_EJE = '#a1a1aa';

export function colorCategorico(indice: number): string {
  return PALETA_CATEGORICA[indice % PALETA_CATEGORICA.length];
}

/** Techo "redondo" del eje Y para que las marcas de escala sean legibles. */
export function techoEscala(maximo: number): number {
  if (maximo <= 0) return 100;
  const exponente = Math.floor(Math.log10(maximo));
  const base = 10 ** exponente;
  for (const paso of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (maximo <= paso * base) return paso * base;
  }
  return 10 * base;
}
