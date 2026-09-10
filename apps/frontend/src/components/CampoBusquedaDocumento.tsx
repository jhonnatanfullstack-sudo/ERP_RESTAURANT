import { useState } from 'react';
import {
  useFormState,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormGetValues,
  type UseFormRegister,
} from 'react-hook-form';
import { Loader2, Search } from 'lucide-react';
import { CODIGOS_CONSULTABLES, FORMATOS_DOCUMENTO } from '../utils/documento';
import { FormField } from './ui/FormField';
import { claseCampo, descripcionDe } from './ui/campos';
import { mensajeError } from '../utils/errores';
import type { DatosDocumento, TipoDocumentoIdentidad } from '../types/api';

interface CampoBusquedaDocumentoProps<T extends FieldValues> {
  control: Control<T>;
  tipos: TipoDocumentoIdentidad[] | undefined;
  register: UseFormRegister<T>;
  getValues: UseFormGetValues<T>;
  campoTipo: Path<T>;
  campoNumero: Path<T>;
  requerido?: boolean;
  consultar: (tipo: 'dni' | 'ruc', numero: string) => Promise<DatosDocumento>;
  onEncontrado: (datos: DatosDocumento) => void;
}

/**
 * Campo de N° de documento con botón de búsqueda RENIEC/SUNAT, reutilizado
 * entre Personal y Clientes (ambos identifican personas por documento
 * SUNAT). El formulario decide qué hacer con los datos encontrados via
 * `onEncontrado` — cada uno mapea nombres/apellidos a sus propios campos.
 */
export function CampoBusquedaDocumento<T extends FieldValues>({
  control,
  tipos,
  register,
  getValues,
  campoTipo,
  campoNumero,
  requerido,
  consultar,
  onEncontrado,
}: CampoBusquedaDocumentoProps<T>) {
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  const tipoSeleccionadoId = useWatch({ control, name: campoTipo });
  const { errors } = useFormState({ control, name: campoNumero });
  const codigo = tipos?.find((t) => t.id === tipoSeleccionadoId)?.codigo;
  const formato = codigo ? FORMATOS_DOCUMENTO[codigo] : undefined;
  const tipoConsulta = codigo ? CODIGOS_CONSULTABLES[codigo] : undefined;

  const errorValidacion = (errors as Record<string, { message?: string } | undefined>)[campoNumero]
    ?.message;
  const error = errorValidacion ?? errorBusqueda ?? undefined;
  const idCampo = `documento-${campoNumero}`;

  async function buscar() {
    if (!tipoConsulta) return;
    const numero = getValues(campoNumero) as unknown as string;
    if (!numero) return;

    setErrorBusqueda(null);
    setBuscando(true);
    try {
      const datos = await consultar(tipoConsulta, numero);
      onEncontrado(datos);
    } catch (error) {
      setErrorBusqueda(mensajeError(error, 'No se pudo consultar el documento'));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <FormField id={idCampo} label="N° de documento" ayuda={formato?.ayuda} error={error}>
      <div className="flex gap-2">
        <input
          {...register(campoNumero, {
            required: requerido ? 'El número de documento es obligatorio' : false,
            pattern: formato ? { value: formato.patron, message: formato.ayuda } : undefined,
          })}
          id={idCampo}
          maxLength={formato?.maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripcionDe(idCampo, formato?.ayuda, error)}
          className={claseCampo(!!error)}
        />
        {tipoConsulta && (
          <button
            type="button"
            onClick={() => void buscar()}
            disabled={buscando}
            title="Buscar en RENIEC/SUNAT"
            aria-label="Buscar en RENIEC/SUNAT"
            className="flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-3 text-zinc-500 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {buscando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
    </FormField>
  );
}
