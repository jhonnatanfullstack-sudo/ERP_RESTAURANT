import { useId } from 'react';
import type { ReactNode, Ref, SelectHTMLAttributes } from 'react';
import { FormField } from './FormField';
import { claseCampo, descripcionDe } from './campos';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  label: string;
  ayuda?: string;
  /** Mensaje de validación, normalmente `formState.errors.campo?.message`. */
  error?: string;
  children: ReactNode;
  ref?: Ref<HTMLSelectElement>;
  /** Clases extra del contenedor del campo (ej. `sm:col-span-2`). */
  className?: string;
}

/** Select nativo con label asociado, ayuda y mensaje de validación. Para listas que pueden
 * crecer (productos, clientes, personal) usar `Combobox` en su lugar. */
export function Select({
  label,
  ayuda,
  error,
  id,
  className,
  ref,
  children,
  ...props
}: SelectProps) {
  const idAuto = useId();
  const idCampo = id ?? idAuto;

  return (
    <FormField id={idCampo} label={label} ayuda={ayuda} error={error} className={className}>
      <select
        {...props}
        id={idCampo}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={descripcionDe(idCampo, ayuda, error)}
        className={claseCampo(!!error)}
      >
        {children}
      </select>
    </FormField>
  );
}
