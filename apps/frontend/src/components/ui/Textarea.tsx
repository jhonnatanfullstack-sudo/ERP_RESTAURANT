import { useId } from 'react';
import type { Ref, TextareaHTMLAttributes } from 'react';
import { FormField } from './FormField';
import { claseCampo, descripcionDe } from './campos';

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  label: string;
  ayuda?: string;
  /** Mensaje de validación, normalmente `formState.errors.campo?.message`. */
  error?: string;
  ref?: Ref<HTMLTextAreaElement>;
  /** Clases extra del contenedor del campo (ej. `sm:col-span-2`). */
  className?: string;
}

/** Igual que `Input`, pero para texto largo (un reclamo, una descripción). Mismo campo visual
 * que el resto de los controles del formulario — no un `<textarea>` suelto por pantalla. */
export function Textarea({ label, ayuda, error, id, className, ref, ...props }: TextareaProps) {
  const idAuto = useId();
  const idCampo = id ?? idAuto;

  return (
    <FormField id={idCampo} label={label} ayuda={ayuda} error={error} className={className}>
      <textarea
        {...props}
        id={idCampo}
        ref={ref}
        rows={props.rows ?? 4}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcionDe(idCampo, ayuda, error)}
        className={claseCampo(!!error)}
      />
    </FormField>
  );
}
