import {
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from 'react-hook-form';
import { esRucPersonaJuridica } from '../utils/documento';
import type { TipoDocumentoIdentidad } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

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
  const tipoId = useWatch({ control, name: campoTipo });
  const numero = useWatch({ control, name: campoNumero });
  const codigo = tipos?.find((t) => t.id === tipoId)?.codigo;
  const esJuridica = esRucPersonaJuridica(codigo, numero as unknown as string);

  if (esJuridica) {
    return (
      <div>
        <label className={labelClass}>Razón social</label>
        <input
          {...register(campoRazonSocial, { required: true })}
          className={inputClass}
          placeholder="Ej. Restaurantes Reunidos S.A.C."
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className={labelClass}>Nombres</label>
        <input {...register(campoNombres, { required: true })} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Apellidos</label>
        <input {...register(campoApellidos)} className={inputClass} />
      </div>
    </div>
  );
}
