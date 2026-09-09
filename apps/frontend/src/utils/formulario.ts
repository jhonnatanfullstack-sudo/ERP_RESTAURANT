/**
 * Un `<input>` vacío devuelve `''`, pero la API espera `null` para "sin dato":
 * una cadena vacía es rechazada por los schemas zod que exigen `min(1)`.
 * Usar siempre esto al construir el payload de un formulario.
 */
export function vacioANull(valor?: string | null): string | null | undefined {
  return valor === '' ? null : valor;
}
