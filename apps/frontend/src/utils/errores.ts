/** Mensaje de error legible para el usuario: usa el `message` que envía el backend
 * (`{ success: false, message }`) y si no existe, un texto de respaldo del módulo.
 * Nunca mostrar el error técnico crudo (ver UI-UX-GUIDELINES, sección 12). */
export function mensajeError(error: unknown, respaldo: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? respaldo
  );
}
