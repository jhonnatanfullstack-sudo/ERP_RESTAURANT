import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, UserPlus, X } from 'lucide-react';
import * as clientesService from '../services/clientes.service';
import * as catalogosService from '../services/catalogos.service';
import { Button } from './ui/Button';
import { ClienteCrearModal } from './ClienteCrearModal';
import { nombreCliente } from '../utils/formato';
import type { DatosDocumento } from '../types/api';

const inputClass =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none';
const labelClass = 'mb-1.5 block text-sm font-medium text-zinc-700';

function mensajeError(error: unknown, fallback: string): string {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}

interface BuscadorClienteProps {
  clienteId: string | undefined;
  onCambiar: (clienteId: string | undefined) => void;
  requerido?: boolean;
  /** Texto de ayuda extra bajo el campo (ej. "Una factura requiere RUC"). */
  ayuda?: string;
}

/**
 * Búsqueda de cliente por DNI/RUC: si ya existe, lo selecciona directamente; si no, consulta
 * RENIEC/SUNAT y ofrece registrarlo automáticamente con esos datos; siempre hay un botón
 * "+ Nuevo cliente" para el registro manual. Reemplaza el combo simple de cliente en los
 * formularios de Pedidos y Ventas — no duplicar esta lógica de búsqueda en otro lugar.
 */
export function BuscadorCliente({ clienteId, onCambiar, requerido, ayuda }: BuscadorClienteProps) {
  const queryClient = useQueryClient();
  const [tipoBusqueda, setTipoBusqueda] = useState<'dni' | 'ruc'>('dni');
  const [numero, setNumero] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [encontradoApi, setEncontradoApi] = useState<DatosDocumento | null>(null);
  const [modalNuevoAbierto, setModalNuevoAbierto] = useState(false);

  const clientesQuery = useQuery({
    queryKey: ['clientes'],
    queryFn: clientesService.listarClientes,
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
      const apellidos = [encontradoApi.apellidoPaterno, encontradoApi.apellidoMaterno]
        .filter(Boolean)
        .join(' ');
      return clientesService.crearCliente({
        nombres: encontradoApi.razonSocial ? null : (encontradoApi.nombres ?? null),
        apellidos: apellidos || null,
        razonSocial: encontradoApi.razonSocial,
        tipoDocumentoIdentidadId,
        numeroDocumento: encontradoApi.numeroDocumento,
      });
    },
    onSuccess: (cliente) => {
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      setEncontradoApi(null);
      setNumero('');
      onCambiar(cliente.id);
    },
  });

  const clienteSeleccionado = clientesQuery.data?.find((c) => c.id === clienteId);

  async function buscar() {
    if (!numero.trim()) return;
    setErrorBusqueda(null);
    setEncontradoApi(null);
    setBuscando(true);
    try {
      const codigo = tipoBusqueda === 'dni' ? '1' : '6';
      const existente = clientesQuery.data?.find(
        (c) => c.numeroDocumento === numero && c.tipoDocumentoIdentidad?.codigo === codigo,
      );
      if (existente) {
        onCambiar(existente.id);
        return;
      }

      const datos = await clientesService.consultarDocumento(tipoBusqueda, numero);
      setEncontradoApi(datos);
    } catch (error) {
      setErrorBusqueda(mensajeError(error, 'No se pudo consultar el documento'));
    } finally {
      setBuscando(false);
    }
  }

  if (clienteSeleccionado) {
    return (
      <div>
        <label className={labelClass}>
          Cliente {requerido && <span className="text-red-500">*</span>}
        </label>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">
              {nombreCliente(clienteSeleccionado)}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {clienteSeleccionado.tipoDocumentoIdentidad
                ? `${clienteSeleccionado.tipoDocumentoIdentidad.nombre}: ${clienteSeleccionado.numeroDocumento}`
                : 'Sin documento'}
              {clienteSeleccionado.telefono && ` · ${clienteSeleccionado.telefono}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCambiar(undefined)}
            title="Cambiar cliente"
            className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {ayuda && <p className="mt-1 text-xs text-zinc-500">{ayuda}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className={labelClass}>
        Cliente {requerido && <span className="text-red-500">*</span>}
      </label>
      <div className="flex gap-2">
        <select
          value={tipoBusqueda}
          onChange={(e) => setTipoBusqueda(e.target.value as 'dni' | 'ruc')}
          className={`${inputClass} w-24 shrink-0`}
        >
          <option value="dni">DNI</option>
          <option value="ruc">RUC</option>
        </select>
        <input
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
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={buscando || !numero.trim()}
          title="Buscar"
          className="flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-3 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
        >
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setModalNuevoAbierto(true)}
          title="Nuevo cliente"
          className="flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 px-3 text-zinc-500 hover:bg-zinc-50"
        >
          <UserPlus className="h-4 w-4" />
        </button>
      </div>

      {errorBusqueda && (
        <p className="mt-1.5 text-xs text-red-600">
          {errorBusqueda} — puedes registrarlo con{' '}
          <button
            type="button"
            onClick={() => setModalNuevoAbierto(true)}
            className="font-medium text-orange-600 underline hover:text-orange-700"
          >
            + Nuevo cliente
          </button>
          .
        </p>
      )}

      {encontradoApi && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">
              {encontradoApi.razonSocial ??
                `${encontradoApi.nombres ?? ''} ${[encontradoApi.apellidoPaterno, encontradoApi.apellidoMaterno].filter(Boolean).join(' ')}`.trim()}
            </p>
            <p className="text-xs text-zinc-500">
              No está registrado — encontrado en {tipoBusqueda.toUpperCase()}:{' '}
              {encontradoApi.numeroDocumento}
            </p>
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => registrarMutation.mutate()}
            disabled={registrarMutation.isPending}
          >
            {registrarMutation.isPending ? 'Registrando…' : 'Registrar y usar'}
          </Button>
        </div>
      )}
      {registrarMutation.isError && (
        <p className="mt-1.5 text-xs text-red-600">
          {mensajeError(registrarMutation.error, 'No se pudo registrar el cliente')}
        </p>
      )}
      {ayuda && <p className="mt-1 text-xs text-zinc-500">{ayuda}</p>}

      <ClienteCrearModal
        abierto={modalNuevoAbierto}
        onCerrar={() => setModalNuevoAbierto(false)}
        onCreado={(cliente) => {
          setModalNuevoAbierto(false);
          onCambiar(cliente.id);
        }}
        valoresIniciales={{
          numeroDocumento: numero || undefined,
        }}
      />
    </div>
  );
}
