import { useWatch, type Control, type FieldValues, type Path } from 'react-hook-form';
import { esRucPersonaJuridica } from '../utils/documento';
import type { TipoDocumentoIdentidad } from '../types/api';

interface OpcionesEsPersonaJuridica<T extends FieldValues> {
  control: Control<T>;
  tipos: TipoDocumentoIdentidad[] | undefined;
  campoTipo: Path<T>;
  campoNumero: Path<T>;
}

/**
 * ¿El documento elegido en el formulario es un RUC de persona jurídica ("20…")?
 * Compartido por los formularios que cambian entre razón social y nombres/apellidos
 * (Clientes y Personal) — la regla en sí vive en `utils/documento.ts`.
 */
export function useEsPersonaJuridica<T extends FieldValues>({
  control,
  tipos,
  campoTipo,
  campoNumero,
}: OpcionesEsPersonaJuridica<T>): boolean {
  const tipoId = useWatch({ control, name: campoTipo });
  const numero = useWatch({ control, name: campoNumero });
  const codigo = tipos?.find((tipo) => tipo.id === tipoId)?.codigo;
  return esRucPersonaJuridica(codigo, numero as unknown as string);
}
