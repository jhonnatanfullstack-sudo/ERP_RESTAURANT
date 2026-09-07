import { useState } from 'react';
import {
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormGetValues,
  type UseFormRegister,
} from 'react-hook-form';
import { Loader2, Search } from 'lucide-react';
import { CODIGOS_CONSULTABLES, FORMATOS_DOCUMENTO } from '../utils/documento';
import type { DatosDocumento, TipoDocumentoIdentidad } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

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
  const codigo = tipos?.find((t) => t.id === tipoSeleccionadoId)?.codigo;
  const formato = codigo ? FORMATOS_DOCUMENTO[codigo] : undefined;
  const tipoConsulta = codigo ? CODIGOS_CONSULTABLES[codigo] : undefined;

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
    <div>
      <label className={labelClass}>N° de documento</label>
      <div className="flex gap-2">
        <input
          {...register(campoNumero, {
            required: requerido,
            pattern: formato ? { value: formato.patron, message: formato.ayuda } : undefined,
          })}
          maxLength={formato?.maxLength}
          className={inputClass}
        />
        {tipoConsulta && (
          <button
            type="button"
            onClick={() => void buscar()}
            disabled={buscando}
            title="Buscar en RENIEC/SUNAT"
            className="flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-3 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
          >
            {buscando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      {formato && <p className="mt-1 text-xs text-zinc-500">{formato.ayuda}</p>}
      {errorBusqueda && <p className="mt-1 text-xs text-red-600">{errorBusqueda}</p>}
    </div>
  );
}
