import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { FileCheck2, Landmark, ShieldCheck, UploadCloud } from 'lucide-react';
import * as facturacionService from '../services/facturacion.service';
import { useAuth } from '../context/AuthContext';
import { Panel } from '../components/ui/Panel';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { mensajeError } from '../utils/errores';
import type { GuardarConfiguracionFacturacionInput } from '../services/facturacion.service';

/**
 * Certificado digital y OSE con el que se envían boletas/facturas a SUNAT (FASE 28).
 *
 * Dos formularios independientes a propósito: subir el certificado y guardar el OSE son
 * acciones distintas (multipart vs JSON, ver `facturacion.routes.ts`) y no tiene sentido
 * exigir ambas juntas — alguien puede tener el certificado listo y seguir decidiendo el OSE.
 */
export function FacturacionElectronica() {
  const { tienePermiso } = useAuth();
  const queryClient = useQueryClient();
  const puedeConfigurar = tienePermiso('facturacion.configurar');

  const configQuery = useQuery({
    queryKey: ['facturacion-configuracion'],
    queryFn: facturacionService.obtenerConfiguracion,
  });

  const form = useForm<GuardarConfiguracionFacturacionInput>();

  // El formulario se rellena cuando llegan los datos: `defaultValues` no sirve porque en el
  // primer render todavía no existen (mismo patrón que `Configuracion.tsx`).
  useEffect(() => {
    if (configQuery.data) {
      form.reset({
        oseProveedor: configQuery.data.oseProveedor,
        oseUsuario: configQuery.data.oseUsuario ?? '',
        ambiente: configQuery.data.ambiente,
        activo: configQuery.data.activo,
      });
    }
  }, [configQuery.data, form]);

  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const guardarMutation = useMutation({
    mutationFn: facturacionService.guardarConfiguracion,
    onSuccess: () => {
      setErrorGuardar(null);
      setGuardadoOk(true);
      void queryClient.invalidateQueries({ queryKey: ['facturacion-configuracion'] });
    },
    onError: (excepcion) => {
      setGuardadoOk(false);
      setErrorGuardar(mensajeError(excepcion, 'No se pudo guardar la configuración'));
    },
  });

  function guardarOse(datos: GuardarConfiguracionFacturacionInput) {
    return guardarMutation.mutateAsync({
      ...datos,
      // Vacío = "no la cambies": el backend conserva la credencial ya guardada cuando
      // `oseClave` no viaja en absoluto, no cuando viaja vacía.
      oseClave: datos.oseClave ? datos.oseClave : undefined,
      oseProveedor: datos.oseProveedor || null,
    });
  }

  // --- Certificado digital (multipart, formulario aparte) --------------------------------
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [contrasenaCertificado, setContrasenaCertificado] = useState('');
  const [errorCertificado, setErrorCertificado] = useState<string | null>(null);

  const certificadoMutation = useMutation({
    mutationFn: () => facturacionService.subirCertificado(archivo!, contrasenaCertificado),
    onSuccess: () => {
      setErrorCertificado(null);
      setArchivo(null);
      setContrasenaCertificado('');
      if (inputArchivoRef.current) inputArchivoRef.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['facturacion-configuracion'] });
    },
    onError: (excepcion) => {
      setErrorCertificado(mensajeError(excepcion, 'No se pudo guardar el certificado'));
    },
  });

  if (configQuery.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (configQuery.isError || !configQuery.data) {
    return (
      <EmptyState
        icono={ShieldCheck}
        titulo="No se pudo cargar la configuración"
        descripcion={mensajeError(configQuery.error, 'Vuelve a intentarlo en un momento.')}
      />
    );
  }

  const datos = configQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-zinc-900">Facturación electrónica</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Certificado digital y OSE con el que se envían tus boletas y facturas a SUNAT.
        </p>
      </header>

      <Alert
        tipo={datos.activo ? 'exito' : 'advertencia'}
        mensaje={
          datos.activo
            ? 'La facturación electrónica está activa: las ventas se pueden emitir a SUNAT desde su detalle.'
            : 'Todavía no está activa. Sube el certificado, configura el OSE y marca "Activar" para empezar a emitir.'
        }
      />

      {!puedeConfigurar && (
        <Alert
          tipo="advertencia"
          mensaje="No tienes el permiso para cambiar esta configuración: solo puedes consultarla."
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          titulo="Certificado digital"
          descripcion="El .pfx/.p12 emitido a nombre de tu empresa"
          icono={FileCheck2}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {datos.tieneCertificado ? (
                <Badge tono="exito">Certificado cargado</Badge>
              ) : (
                <Badge tono="neutral">Sin certificado</Badge>
              )}
              {datos.certificadoValidoHasta && (
                <span className="text-sm text-zinc-500">
                  Vence el {datos.certificadoValidoHasta}
                </span>
              )}
            </div>

            {errorCertificado && <Alert tipo="error" mensaje={errorCertificado} />}

            {puedeConfigurar && (
              <form
                onSubmit={(evento) => {
                  evento.preventDefault();
                  if (archivo && contrasenaCertificado) certificadoMutation.mutate();
                }}
                className="flex flex-col gap-3"
              >
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    Archivo (.pfx / .p12)
                  </label>
                  <input
                    ref={inputArchivoRef}
                    type="file"
                    accept=".pfx,.p12"
                    onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
                  />
                </div>
                <Input
                  label="Contraseña del certificado"
                  type="password"
                  value={contrasenaCertificado}
                  onChange={(evento) => setContrasenaCertificado(evento.target.value)}
                />
                <Button
                  type="submit"
                  variante="secondary"
                  icono={<UploadCloud className="h-4 w-4" />}
                  cargando={certificadoMutation.isPending}
                  disabled={!archivo || !contrasenaCertificado}
                >
                  Guardar certificado
                </Button>
              </form>
            )}
          </div>
        </Panel>

        <Panel
          titulo="Operador de Servicios Electrónicos (OSE)"
          descripcion="Quién tramita el envío a SUNAT"
          icono={Landmark}
        >
          <form
            onSubmit={(evento) => void form.handleSubmit(guardarOse)(evento)}
            className="flex flex-col gap-4"
          >
            {errorGuardar && <Alert tipo="error" mensaje={errorGuardar} />}
            {guardadoOk && !form.formState.isDirty && (
              <Alert tipo="exito" mensaje="Configuración guardada" />
            )}

            <Select
              label="Proveedor OSE"
              disabled={!puedeConfigurar}
              {...form.register('oseProveedor')}
            >
              <option value="">Sin elegir</option>
              <option value="nubefact">NubeFacT</option>
            </Select>
            <Input
              label="Usuario del OSE"
              disabled={!puedeConfigurar}
              {...form.register('oseUsuario')}
            />
            <Input
              label="Clave del OSE"
              type="password"
              ayuda={
                datos.tieneCredencialOse
                  ? 'Ya hay una guardada — déjala en blanco para conservarla'
                  : undefined
              }
              disabled={!puedeConfigurar}
              {...form.register('oseClave')}
            />
            <Select label="Ambiente" disabled={!puedeConfigurar} {...form.register('ambiente')}>
              <option value="beta">Beta / pruebas</option>
              <option value="produccion">Producción</option>
            </Select>
            <Checkbox
              label="Activar la facturación electrónica"
              ayuda="Sin esto, emitir una venta a SUNAT devuelve un aviso pidiendo terminar la configuración"
              disabled={!puedeConfigurar}
              {...form.register('activo')}
            />
            {puedeConfigurar && (
              <Button type="submit" cargando={guardarMutation.isPending}>
                Guardar
              </Button>
            )}
          </form>
        </Panel>
      </div>
    </div>
  );
}
