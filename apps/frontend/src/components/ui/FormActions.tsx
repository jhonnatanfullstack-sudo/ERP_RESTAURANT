import { Button } from './Button';

interface FormActionsProps {
  /** Texto de la acción principal en reposo (ej. "Crear categoría"). */
  enviar: string;
  onCancelar: () => void;
  enviando?: boolean;
  /** Texto mientras la acción está en curso. */
  enviandoTexto?: string;
  cancelar?: string;
  variante?: 'primary' | 'danger';
}

/** Pie estándar de un formulario: acción secundaria (Cancelar) + acción principal.
 * En móvil se apilan con la principal arriba; en pantallas mayores van alineadas
 * a la derecha (ver UI-UX-GUIDELINES, secciones 6 y 10). */
export function FormActions({
  enviar,
  onCancelar,
  enviando = false,
  enviandoTexto = 'Guardando…',
  cancelar = 'Cancelar',
  variante = 'primary',
}: FormActionsProps) {
  return (
    <div className="mt-2 flex flex-col-reverse gap-2 border-t border-zinc-100 pt-4 sm:flex-row sm:justify-end">
      <Button type="button" variante="secondary" onClick={onCancelar} disabled={enviando}>
        {cancelar}
      </Button>
      <Button type="submit" variante={variante} cargando={enviando}>
        {enviando ? enviandoTexto : enviar}
      </Button>
    </div>
  );
}
