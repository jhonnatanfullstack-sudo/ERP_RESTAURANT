import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { claseAyuda, claseError, claseLabel, idAyudaDe, idErrorDe } from './campos';

interface FormFieldProps {
  /** Debe coincidir con el `id` del control que envuelve, para asociar label y mensajes. */
  id: string;
  label: string;
  ayuda?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

/** Envoltura estándar de un campo: label asociado + control + ayuda o mensaje de error.
 * `Input`/`Select`/`Checkbox` ya la usan por dentro; usarla directamente solo para
 * controles propios (ej. `Combobox`) que no son un input nativo. */
export function FormField({ id, label, ayuda, error, children, className = '' }: FormFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className={claseLabel}>
        {label}
      </label>
      {children}
      {ayuda && !error && (
        <p id={idAyudaDe(id)} className={claseAyuda}>
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idErrorDe(id)} className={claseError}>
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
