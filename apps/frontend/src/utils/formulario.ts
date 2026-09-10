/**
 * Un `<input>` vacío devuelve `''`, pero la API espera `null` para "sin dato":
 * una cadena vacía es rechazada por los schemas zod que exigen `min(1)`.
 * Usar siempre esto al construir el payload de un formulario.
 */
export function vacioANull(valor?: string | null): string | null | undefined {
  return valor === '' ? null : valor;
}

/**
 * Igual que `vacioANull`, pero para campos verdaderamente opcionales (`.optional()` sin
 * `.nullable()` en el schema zod, ej. un `tipoComprobanteId` o `fechaEmision` opcionales) —
 * ahí la API espera que el campo se omita (`undefined`), no `null`.
 */
export function vacioAIndefinido(valor?: string): string | undefined {
  return valor === '' ? undefined : valor;
}
