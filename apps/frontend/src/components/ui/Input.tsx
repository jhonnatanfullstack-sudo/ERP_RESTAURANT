import { useId } from 'react';
import type { InputHTMLAttributes, Ref } from 'react';
import { FormField } from './FormField';
import { claseCampo, descripcionDe } from './campos';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  ayuda?: string;
  /** Mensaje de validación, normalmente `formState.errors.campo?.message`. */
  error?: string;
  ref?: Ref<HTMLInputElement>;
  /** Clases extra del contenedor del campo (ej. `sm:col-span-2`). */
  className?: string;
}

/** Input de formulario con label asociado, ayuda y mensaje de validación.
 * Acepta el spread de `register()` de react-hook-form directamente. */
export function Input({ label, ayuda, error, id, className, ref, ...props }: InputProps) {
  const idAuto = useId();
  const idCampo = id ?? idAuto;

  return (
    <FormField id={idCampo} label={label} ayuda={ayuda} error={error} className={className}>
      <input
        {...props}
        id={idCampo}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcionDe(idCampo, ayuda, error)}
        className={claseCampo(!!error)}
      />
    </FormField>
  );
}
