import { useId } from 'react';
import type { InputHTMLAttributes, Ref } from 'react';
import { claseAyuda } from './campos';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  label: string;
  ayuda?: string;
  ref?: Ref<HTMLInputElement>;
  /** Clases extra del contenedor. */
  className?: string;
}

/** Casilla con su etiqueta al costado. Acepta el spread de `register()` directamente. */
export function Checkbox({ label, ayuda, id, className = '', ref, ...props }: CheckboxProps) {
  const idAuto = useId();
  const idCampo = id ?? idAuto;

  return (
    <div className={className}>
      <label htmlFor={idCampo} className="flex items-start gap-2.5 text-sm text-zinc-700">
        <input
          {...props}
          type="checkbox"
          id={idCampo}
          ref={ref}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-orange-600 focus:ring-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span>{label}</span>
      </label>
      {ayuda && <p className={`${claseAyuda} ml-7`}>{ayuda}</p>}
    </div>
  );
}
