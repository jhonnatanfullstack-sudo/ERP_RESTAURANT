import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MapPin, Search, Truck, X } from 'lucide-react';
import * as proveedoresService from '../services/proveedores.service';
import * as catalogosService from '../services/catalogos.service';
import { Button } from './ui/Button';
import { claseCampo, claseLabel } from './ui/campos';
import { ProveedorCrearModal } from './ProveedorCrearModal';
import { nombreCliente } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import { NUMERO_DOCUMENTO_VARIOS } from '../utils/documento';
import type { DatosDocumento } from '../types/api';

const claseBotonCampo =
  'flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50';

interface BuscadorProveedorProps {
  proveedorId: string | undefined;
  onCambiar: (proveedorId: string | undefined) => void;
  requerido?: boolean;
  /** Texto de ayuda extra bajo el campo. */
  ayuda?: string;
  /** Mensaje de validación del formulario que lo contiene. */
  error?: string;
}

/**
 * Búsqueda de proveedor por DNI/RUC: si ya existe, lo selecciona directamente; si no,
 * consulta RENIEC/SUNAT y ofrece registrarlo automáticamente con esos datos (incluida su
 * dirección fiscal), y siempre hay un botón "+ Nuevo proveedor" para el registro manual. Al
 * abrir una compra nueva preselecciona "Proveedores Varios" (ver `NUMERO_DOCUMENTO_VARIOS`).
 * Mismo patrón que `BuscadorCliente` — usarlo en el formulario de Compras en vez de un
 * combo simple, para no obligar a registrar proveedores desde otra pantalla primero.
 */
export function BuscadorProveedor({
  proveedorId,
  onCambiar,
  requerido,
  ayuda,
  error,
}: BuscadorProveedorProps) {
  const queryClient = useQueryClient();
  const idNumero = useId();
  const [tipoBusqueda, setTipoBusqueda] = useState<'dni' | 'ruc'>('ruc');
  const [numero, setNumero] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [encontradoApi, setEncontradoApi] = useState<DatosDocumento | null>(null);
  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false);

  const proveedoresQuery = useQuery({
    queryKey: ['proveedores'],
    queryFn: proveedoresService.listarProveedores,
  });
  const tiposDocQuery = useQuery({
    queryKey: ['tipos-documento-identidad'],
    queryFn: catalogosService.listarTiposDocumentoIdentidad,
  });

  const registrarMutation = useMutation({
    mutationFn: async () => {
      if (!encontradoApi) throw new Error('Sin datos para registrar');
      const codigo = tipoBusqueda === 'dni' ? '1' : '6';
      const tipoDocumentoIdentidadId = tiposDocQuery.data?.find((t) => t.codigo === codigo)?.id;
      if (!tipoDocumentoIdentidadId) throw new Error('No se encontró el tipo de documento');
      const apellidos = [encontradoApi.apellidoPaterno, encontradoApi.apellidoMaterno]
        .filter(Boolean)
        .join(' ');
      return proveedoresService.crearProveedor({
        nombres: encontradoApi.razonSocial ? null : (encontradoApi.nombres ?? null),
        apellidos: apellidos || null,
        razonSocial: encontradoApi.razonSocial,
        tipoDocumentoIdentidadId,
        numeroDocumento: encontradoApi.numeroDocumento,
        direccion: encontradoApi.direccion,
      });
    },
    onSuccess: (proveedor) => {
      queryClient.invalidateQueries({ queryKey: ['proveedores'] });
      setEncontradoApi(null);
      setNumero('');
      onCambiar(proveedor.id);
    },
  });

  const proveedorSeleccionado = proveedoresQuery.data?.find((p) => p.id === proveedorId);

  // Al abrir una compra nueva (sin proveedor aún elegido), preselecciona "Proveedores Varios"
  // para no obligar a buscar/registrar uno en la compra más común. Solo ocurre una vez: si el
  // operador lo quita a propósito, no se vuelve a forzar.
  const yaPreseleccionado = useRef(proveedorId !== undefined);
  useEffect(() => {
    if (yaPreseleccionado.current) return;
    if (proveedorId !== undefined) {
      yaPreseleccionado.current = true;
      return;
    }
    const proveedorVarios = proveedoresQuery.data?.find(
      (p) => p.numeroDocumento === NUMERO_DOCUMENTO_VARIOS,
    );
    if (proveedorVarios) {
      yaPreseleccionado.current = true;
      onCambiar(proveedorVarios.id);
    }
  }, [proveedoresQuery.data, proveedorId, onCambiar]);

  async function buscar() {
    if (!numero.trim()) return;
    setErrorBusqueda(null);
    setEncontradoApi(null);
    setBuscando(true);
    try {
      const codigo = tipoBusqueda === 'dni' ? '1' : '6';
      const existente = proveedoresQuery.data?.find(
        (p) => p.numeroDocumento === numero && p.tipoDocumentoIdentidad.codigo === codigo,
      );
      if (existente) {
        onCambiar(existente.id);
        return;
      }

      const datos = await proveedoresService.consultarDocumento(tipoBusqueda, numero);
      setEncontradoApi(datos);
    } catch (error) {
      setErrorBusqueda(mensajeError(error, 'No se pudo consultar el documento'));
    } finally {
      setBuscando(false);
    }
  }

  const etiqueta = <>Proveedor {requerido && <span className="text-red-500">*</span>}</>;

  if (proveedorSeleccionado) {
    return (
      <div>
        <p className={claseLabel}>{etiqueta}</p>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">
              {nombreCliente(proveedorSeleccionado)}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {proveedorSeleccionado.tipoDocumentoIdentidad.nombre}:{' '}
              {proveedorSeleccionado.numeroDocumento}
              {proveedorSeleccionado.telefono && ` · ${proveedorSeleccionado.telefono}`}
            </p>
            {proveedorSeleccionado.direccion && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-500">
                <MapPin className="h-3 w-3 shrink-0" />
                {proveedorSeleccionado.direccion}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onCambiar(undefined)}
            title="Quitar proveedor"
            aria-label="Quitar proveedor"
            className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {ayuda && <p className="mt-1.5 text-xs text-zinc-500">{ayuda}</p>}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={idNumero} className={claseLabel}>
        {etiqueta}
      </label>

      <div className="flex flex-wrap gap-2">
        <select
          value={tipoBusqueda}
          onChange={(e) => setTipoBusqueda(e.target.value as 'dni' | 'ruc')}
          aria-label="Tipo de documento a buscar"
          className={`${claseCampo(!!error)} w-20 shrink-0`}
        >
          <option value="ruc">RUC</option>
          <option value="dni">DNI</option>
        </select>
        <input
          id={idNumero}
          value={numero}
          onChange={(e) => {
            setNumero(e.target.value);
            setEncontradoApi(null);
            setErrorBusqueda(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void buscar();
            }
          }}
          maxLength={tipoBusqueda === 'dni' ? 8 : 11}
          placeholder={tipoBusqueda === 'dni' ? '8 dígitos' : '11 dígitos'}
          aria-invalid={error ? true : undefined}
          className={`${claseCampo(!!error)} min-w-32 flex-1`}
        />
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={buscando || !numero.trim()}
          className={claseBotonCampo}
        >
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
        <button
          type="button"
          onClick={() => setModalNuevoAbierto(true)}
          className={claseBotonCampo}
        >
          <Truck className="h-4 w-4" />
          Nuevo
        </button>
      </div>

      {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}

      {errorBusqueda && (
        <p className="mt-1.5 text-xs text-red-600">
          {errorBusqueda} — puedes registrarlo con{' '}
          <button
            type="button"
            onClick={() => setModalNuevoAbierto(true)}
            className="font-medium text-orange-600 underline hover:text-orange-700"
          >
            + Nuevo proveedor
          </button>
          .
        </p>
      )}

      {encontradoApi && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">
              {encontradoApi.razonSocial ??
                `${encontradoApi.nombres ?? ''} ${[encontradoApi.apellidoPaterno, encontradoApi.apellidoMaterno].filter(Boolean).join(' ')}`.trim()}
            </p>
            <p className="text-xs text-zinc-500">
              No está registrado — encontrado en {tipoBusqueda.toUpperCase()}:{' '}
              {encontradoApi.numeroDocumento}
            </p>
            {encontradoApi.direccion && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-500">
                <MapPin className="h-3 w-3 shrink-0" />
                {encontradoApi.direccion}
              </p>
            )}
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => registrarMutation.mutate()}
            cargando={registrarMutation.isPending}
          >
            {registrarMutation.isPending ? 'Registrando…' : 'Registrar y usar'}
          </Button>
        </div>
      )}
      {registrarMutation.isError && (
        <p className="mt-1.5 text-xs text-red-600">
          {mensajeError(registrarMutation.error, 'No se pudo registrar el proveedor')}
        </p>
      )}
      {ayuda && !error && <p className="mt-1.5 text-xs text-zinc-500">{ayuda}</p>}

      <ProveedorCrearModal
        abierto={modalNuevoAbierto}
        onCerrar={() => setModalNuevoAbierto(false)}
        onCreado={(proveedor) => {
          setModalNuevoAbierto(false);
          onCambiar(proveedor.id);
        }}
        valoresIniciales={{
          numeroDocumento: numero || undefined,
        }}
      />
    </div>
  );
}
