import {
  useFormState,
  type Control,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from 'react-hook-form';
import { useEsPersonaJuridica } from '../hooks/useEsPersonaJuridica';
import { Input } from './ui/Input';
import type { TipoDocumentoIdentidad } from '../types/api';

interface CamposIdentidadClienteProps<T extends FieldValues> {
  control: Control<T>;
  register: UseFormRegister<T>;
  tipos: TipoDocumentoIdentidad[] | undefined;
  campoTipo: Path<T>;
  campoNumero: Path<T>;
  campoNombres: Path<T>;
  campoApellidos: Path<T>;
  campoRazonSocial: Path<T>;
}

/** Nombres+Apellidos o Razón social, nunca ambos — depende de si el documento elegido es
 * un RUC de persona jurídica (empieza en "20"). Compartido entre el formulario de Clientes
 * y el buscador de cliente embebido en Pedidos/Ventas — no duplicar esta lógica. */
export function CamposIdentidadCliente<T extends FieldValues>({
  control,
  register,
  tipos,
  campoTipo,
  campoNumero,
  campoNombres,
  campoApellidos,
  campoRazonSocial,
}: CamposIdentidadClienteProps<T>) {
  const { errors } = useFormState({ control });
  const esJuridica = useEsPersonaJuridica({ control, tipos, campoTipo, campoNumero });

  const errorDe = (campo: Path<T>) =>
    (errors as Record<string, { message?: string } | undefined>)[campo]?.message;

  if (esJuridica) {
    return (
      <Input
        label="Razón social"
        placeholder="Ej. Restaurantes Reunidos S.A.C."
        ayuda="Un RUC que empieza en 20 es de una empresa: se identifica por razón social."
        error={errorDe(campoRazonSocial)}
        {...register(campoRazonSocial, { required: 'La razón social es obligatoria' })}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input
        label="Nombres"
        error={errorDe(campoNombres)}
        {...register(campoNombres, { required: 'Los nombres son obligatorios' })}
      />
      <Input label="Apellidos" error={errorDe(campoApellidos)} {...register(campoApellidos)} />
    </div>
  );
}
