/** Clases compartidas por todos los controles de formulario (Input, Select, Checkbox,
 * Combobox y cualquier control futuro). Fuente única: antes cada página repetía estas
 * mismas clases sueltas en su propio `inputClass`/`labelClass`. */

export const claseLabel = 'mb-1.5 block text-sm font-medium text-zinc-700';
export const claseAyuda = 'mt-1.5 text-xs text-zinc-500';
export const claseError = 'mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600';

const base =
  'w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2 focus:outline-none';
const sinError = 'border-zinc-300 focus:border-orange-500 focus:ring-orange-500/20';
const conError = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';
const deshabilitado = 'disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400';

export function claseCampo(hayError = false): string {
  return `${base} ${hayError ? conError : sinError} ${deshabilitado}`;
}

export const idAyudaDe = (id: string) => `${id}-ayuda`;
export const idErrorDe = (id: string) => `${id}-error`;

/** `aria-describedby` del control: apunta al mensaje de error si lo hay, si no a la ayuda. */
export function descripcionDe(
  id: string,
  ayuda: string | undefined,
  error: string | undefined,
): string | undefined {
  if (error) return idErrorDe(id);
  if (ayuda) return idAyudaDe(id);
  return undefined;
}
