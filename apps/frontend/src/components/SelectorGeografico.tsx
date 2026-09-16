import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { Select } from './ui/Select';
import type { DivisionAdministrativa, Pais } from '../types/api';

interface SelectorGeograficoProps<T extends FieldValues> {
  control: Control<T>;
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  campoPais: Path<T>;
  campoDistrito: Path<T>;
  /** Valores actuales del registro que se está editando, con la cadena `distrito.padre.padre`
   * ya cargada — permite preseleccionar departamento/provincia sin otra consulta. `undefined`
   * en un alta nueva. */
  paisInicial?: Pais | null;
  distritoInicial?: DivisionAdministrativa | null;
  consultarPaises: () => Promise<Pais[]>;
  consultarDivisiones: (
    paisId: string,
    padreId?: string | null,
  ) => Promise<DivisionAdministrativa[]>;
  erroresPais?: string;
  erroresDistrito?: string;
  requerido?: boolean;
  /** Si no hay `paisInicial`, país que se preselecciona en cuanto carga el catálogo — el
   * sistema es peruano por defecto (ver CLAUDE.md sección 1). `null` para no preseleccionar
   * ninguno. */
  codigoIso2PorDefecto?: string | null;
}

/**
 * País → departamento → provincia → distrito en cascada (FASE 27). Solo `pais`/`distrito`
 * viajan al formulario (departamento/provincia son navegación local): se pueden recuperar
 * después leyendo `distrito.padre`/`distrito.padre.padre`, no hace falta duplicarlos.
 *
 * Departamento y provincia son selects **controlados** (`value` + estado local) a propósito:
 * necesitan volver a "Selecciona…" cuando cambia el nivel de arriba, y eso no pasa solo con
 * `defaultValue` en un select no controlado. País y distrito, en cambio, siguen el mismo
 * patrón `defaultValue` + `register` que el resto de campos del proyecto — su reseteo lo hace
 * `setValue`, que si actualiza el DOM de un campo registrado.
 *
 * Reutilizado tal cual entre el registro público (`RegistroDemo`, catálogo sin sesión) y la
 * edición de `Empresa` (catálogo autenticado): cuál de los dos usar lo decide quien llama,
 * pasando `consultarPaises`/`consultarDivisiones`.
 */
export function SelectorGeografico<T extends FieldValues>({
  control,
  register,
  setValue,
  campoPais,
  campoDistrito,
  paisInicial,
  distritoInicial,
  consultarPaises,
  consultarDivisiones,
  erroresPais,
  erroresDistrito,
  requerido,
  codigoIso2PorDefecto = 'PE',
}: SelectorGeograficoProps<T>) {
  const provinciaInicial = distritoInicial?.padre ?? null;
  const departamentoInicial = provinciaInicial?.padre ?? null;

  const [departamentoId, setDepartamentoId] = useState(departamentoInicial?.id ?? '');
  const [provinciaId, setProvinciaId] = useState(provinciaInicial?.id ?? '');

  const paisId = useWatch({ control, name: campoPais }) as unknown as string | undefined;

  const paisesQuery = useQuery({ queryKey: ['geografia-paises'], queryFn: consultarPaises });
  const departamentosQuery = useQuery({
    queryKey: ['geografia-divisiones', paisId, null],
    queryFn: () => consultarDivisiones(paisId!, null),
    enabled: !!paisId,
  });
  const provinciasQuery = useQuery({
    queryKey: ['geografia-divisiones', paisId, departamentoId],
    queryFn: () => consultarDivisiones(paisId!, departamentoId),
    enabled: !!paisId && !!departamentoId,
  });
  const distritosQuery = useQuery({
    queryKey: ['geografia-divisiones', paisId, provinciaId],
    queryFn: () => consultarDivisiones(paisId!, provinciaId),
    enabled: !!paisId && !!provinciaId,
  });

  // Sin país inicial (alta nueva): en cuanto carga el catálogo, preselecciona Perú — no pisa
  // una elección que el usuario ya haya hecho a mano mientras tanto.
  useEffect(() => {
    if (paisInicial || paisId || !codigoIso2PorDefecto) return;
    const porDefecto = paisesQuery.data?.find((p) => p.codigoIso2 === codigoIso2PorDefecto);
    if (porDefecto) {
      setValue(campoPais, porDefecto.id as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paisesQuery.data, paisInicial, codigoIso2PorDefecto]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Select
        label="País"
        error={erroresPais}
        defaultValue={paisInicial?.id ?? ''}
        {...register(campoPais, {
          required: requerido ? 'Elige el país' : false,
          onChange: () => {
            setDepartamentoId('');
            setProvinciaId('');
            setValue(campoDistrito, '' as never);
          },
        })}
      >
        <option value="">Selecciona…</option>
        {paisesQuery.data?.map((pais) => (
          <option key={pais.id} value={pais.id}>
            {pais.nombre}
          </option>
        ))}
      </Select>

      <Select
        label="Departamento"
        value={departamentoId}
        disabled={!paisId}
        onChange={(evento) => {
          setDepartamentoId(evento.target.value);
          setProvinciaId('');
          setValue(campoDistrito, '' as never);
        }}
      >
        <option value="">Selecciona…</option>
        {departamentosQuery.data?.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nombre}
          </option>
        ))}
      </Select>

      <Select
        label="Provincia"
        value={provinciaId}
        disabled={!departamentoId}
        onChange={(evento) => {
          setProvinciaId(evento.target.value);
          setValue(campoDistrito, '' as never);
        }}
      >
        <option value="">Selecciona…</option>
        {provinciasQuery.data?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </Select>

      <Select
        label="Distrito"
        error={erroresDistrito}
        defaultValue={distritoInicial?.id ?? ''}
        disabled={!provinciaId}
        {...register(campoDistrito, { required: requerido ? 'Elige el distrito' : false })}
      >
        <option value="">{requerido ? 'Selecciona…' : 'Sin especificar'}</option>
        {distritosQuery.data?.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nombre}
          </option>
        ))}
      </Select>
    </div>
  );
}
