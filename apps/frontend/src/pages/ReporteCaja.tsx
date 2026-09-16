import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import * as cajaService from '../services/caja.service';
import * as ventasService from '../services/ventas.service';
import * as cobranzasService from '../services/cobranzas.service';
import * as empresaService from '../services/empresa.service';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import {
  CODIGO_MEDIO_PAGO_EFECTIVO,
  pagosEfectivoEnPeriodo,
  segmentosMedioPago,
  ventasEnPeriodo,
} from '../utils/metricas';
import {
  formatearFechaHora,
  formatearHora,
  formatearPrecio,
  nombrePersonal,
} from '../utils/formato';

const ETIQUETA_TIPO_MOVIMIENTO: Record<'ingreso' | 'egreso', string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
};

/**
 * Reporte de arqueo para archivar o firmar — a diferencia de `TicketVenta.tsx`/
 * `TicketComanda.tsx` (recibos de 80mm para impresora térmica), este es un documento tamaño
 * carta: lleva más contenido (el desglose completo del efectivo esperado, cada movimiento
 * manual, la venta por medio de pago) del que una comanda o un ticket necesitan mostrar. Usa
 * el `@page { margin: 14mm }` que ya trae `index.css` para el resto de reportes del sistema,
 * en vez de definir el suyo propio como sí hace el ticket térmico con su `80mm`.
 *
 * Vive en su propia ruta sin `AdminLayout` (se abre en pestaña nueva desde `Caja.tsx`), mismo
 * criterio que los tickets: en papel no debe aparecer ni el sidebar ni la barra superior.
 *
 * Funciona tanto para una sesión ya cerrada (con `montoEsperado`/`montoDeclarado`/`diferencia`
 * ya congelados por el backend) como para la sesión **abierta** en curso — un corte antes de
 * decidir cerrar, calculado en vivo con el mismo criterio que la vista previa de `Caja.tsx`
 * (`ventasEnPeriodo`/`pagosEfectivoEnPeriodo` en `utils/metricas.ts`, para que el papel nunca
 * diga algo distinto de lo que decía la pantalla).
 */
export function ReporteCaja() {
  const { id = '' } = useParams<{ id: string }>();

  const cajaQuery = useQuery({
    queryKey: ['caja', id],
    queryFn: () => cajaService.obtenerCaja(id),
    enabled: id.length > 0,
  });
  const ventasQuery = useQuery({
    queryKey: ['ventas'],
    queryFn: () => ventasService.listarVentas(),
  });
  const cobranzasQuery = useQuery({
    queryKey: ['cuentas-por-cobrar', false],
    queryFn: () => cobranzasService.listarCuentasPorCobrar(false),
  });
  const empresasQuery = useQuery({
    queryKey: ['empresas'],
    queryFn: empresaService.listarEmpresas,
  });

  if (cajaQuery.isLoading || ventasQuery.isLoading || cobranzasQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!cajaQuery.data) return null;

  const caja = cajaQuery.data;
  const empresa = empresasQuery.data?.[0];
  const enCurso = caja.estado === 'abierta';

  const ventasSesion = ventasEnPeriodo(ventasQuery.data ?? [], caja.creadoEn, caja.fechaCierre);
  const efectivoVentas = ventasSesion
    .filter((v) => v.medioPago?.codigo === CODIGO_MEDIO_PAGO_EFECTIVO)
    .reduce((suma, v) => suma + v.total, 0);
  const pagosCreditoEfectivo = pagosEfectivoEnPeriodo(
    cobranzasQuery.data ?? [],
    caja.creadoEn,
    caja.fechaCierre,
  );
  const segmentosPago = segmentosMedioPago(ventasSesion);

  const ingresos = caja.movimientos.filter((m) => m.tipo === 'ingreso');
  const egresos = caja.movimientos.filter((m) => m.tipo === 'egreso');
  const totalIngresos = ingresos.reduce((s, m) => s + m.monto, 0);
  const totalEgresos = egresos.reduce((s, m) => s + m.monto, 0);

  // Para una sesión en curso el backend todavía no congeló nada: se recalcula aquí con el
  // mismo criterio que `Caja.tsx` — es exactamente el número que el cajero ya está viendo en
  // pantalla en este momento.
  const efectivoEsperado =
    caja.montoEsperado ??
    Math.round(
      (caja.montoApertura + efectivoVentas + pagosCreditoEfectivo + totalIngresos - totalEgresos) *
        100,
    ) / 100;

  const movimientosOrdenados = [...caja.movimientos].sort(
    (a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime(),
  );

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-100 py-6">
      <div className="no-imprimir mb-4 flex gap-2">
        <Button icono={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          Imprimir
        </Button>
        <Button variante="secondary" onClick={() => window.close()}>
          Cerrar
        </Button>
      </div>

      <div className="w-[210mm] max-w-full bg-white p-10 text-sm text-zinc-900 shadow-sm print:shadow-none">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-300 pb-4">
          <div>
            <p className="text-lg font-bold uppercase">
              {empresa?.nombreComercial ?? empresa?.razonSocial ?? 'Restaurante'}
            </p>
            {empresa?.ruc && <p className="text-zinc-600">RUC {empresa.ruc}</p>}
            {empresa?.direccionFiscal && <p className="text-zinc-600">{empresa.direccionFiscal}</p>}
            {empresa?.telefono && <p className="text-zinc-600">Tel. {empresa.telefono}</p>}
          </div>
          <div className="text-right">
            <p className="text-base font-bold">Reporte de arqueo de caja</p>
            <p className="text-zinc-500">
              {enCurso ? 'Corte de sesión en curso' : 'Sesión cerrada'}
            </p>
            <Badge tono={enCurso ? 'exito' : 'neutral'}>{enCurso ? 'Abierta' : 'Cerrada'}</Badge>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 border-b border-zinc-200 pb-5">
          <div>
            <p className="text-xs text-zinc-500 uppercase">Apertura</p>
            <p className="font-semibold">{nombrePersonal(caja.usuarioApertura.personal)}</p>
            <p className="text-zinc-600">{formatearFechaHora(caja.creadoEn)}</p>
            {caja.observacionApertura && (
              <p className="mt-1 text-xs text-zinc-500">{caja.observacionApertura}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-zinc-500 uppercase">Cierre</p>
            {enCurso ? (
              <p className="text-zinc-500 italic">Sesión todavía abierta al momento de imprimir</p>
            ) : (
              <>
                <p className="font-semibold">
                  {caja.usuarioCierre ? nombrePersonal(caja.usuarioCierre.personal) : '—'}
                </p>
                {caja.fechaCierre && (
                  <p className="text-zinc-600">{formatearFechaHora(caja.fechaCierre)}</p>
                )}
                {caja.observacionCierre && (
                  <p className="mt-1 text-xs text-zinc-500">{caja.observacionCierre}</p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-2 font-semibold">Efectivo esperado en caja</p>
          <table className="w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-1.5">Monto de apertura</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatearPrecio(caja.montoApertura)}
                </td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-1.5">+ Ventas al contado en efectivo</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatearPrecio(efectivoVentas)}
                </td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-1.5">+ Cobros de crédito en efectivo</td>
                <td className="py-1.5 text-right tabular-nums">
                  {formatearPrecio(pagosCreditoEfectivo)}
                </td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-1.5">+ Ingresos manuales ({ingresos.length})</td>
                <td className="py-1.5 text-right tabular-nums">{formatearPrecio(totalIngresos)}</td>
              </tr>
              <tr className="border-b border-zinc-200">
                <td className="py-1.5">− Egresos manuales ({egresos.length})</td>
                <td className="py-1.5 text-right tabular-nums">{formatearPrecio(totalEgresos)}</td>
              </tr>
              <tr className="font-bold">
                <td className="py-2">{enCurso ? 'Esperado en este momento' : 'Total esperado'}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatearPrecio(efectivoEsperado)}
                </td>
              </tr>
              {!enCurso && caja.montoDeclarado !== null && (
                <>
                  <tr className="border-t border-zinc-200">
                    <td className="py-1.5">Monto declarado (contado físicamente)</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatearPrecio(caja.montoDeclarado)}
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td className="py-2">Diferencia</td>
                    <td className="py-2 text-right tabular-nums">
                      {caja.diferencia !== null && (
                        <span
                          className={
                            caja.diferencia === 0
                              ? 'text-emerald-700'
                              : caja.diferencia > 0
                                ? 'text-zinc-900'
                                : 'text-red-700'
                          }
                        >
                          {caja.diferencia > 0 ? '+' : ''}
                          {formatearPrecio(caja.diferencia)}
                          {caja.diferencia === 0
                            ? ' (cuadrada)'
                            : caja.diferencia > 0
                              ? ' (sobrante)'
                              : ' (faltante)'}
                        </span>
                      )}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {segmentosPago.length > 0 && (
          <div className="evitar-corte mt-6">
            <p className="mb-2 font-semibold">Ventas por medio de pago</p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs text-zinc-500 uppercase">
                  <th className="py-1.5 font-medium">Medio de pago</th>
                  <th className="py-1.5 text-right font-medium">Vendido</th>
                </tr>
              </thead>
              <tbody>
                {segmentosPago.map((segmento) => (
                  <tr key={segmento.etiqueta} className="border-b border-zinc-100">
                    <td className="py-1.5">{segmento.etiqueta}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatearPrecio(segmento.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="evitar-corte mt-6">
          <p className="mb-2 font-semibold">Movimientos manuales ({caja.movimientos.length})</p>
          {movimientosOrdenados.length === 0 ? (
            <p className="text-zinc-500 italic">Sin movimientos manuales en esta sesión.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left text-xs text-zinc-500 uppercase">
                  <th className="py-1.5 font-medium">Hora</th>
                  <th className="py-1.5 font-medium">Tipo</th>
                  <th className="py-1.5 font-medium">Concepto</th>
                  <th className="py-1.5 font-medium">Registrado por</th>
                  <th className="py-1.5 text-right font-medium">Monto</th>
                </tr>
              </thead>
              <tbody>
                {movimientosOrdenados.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-100">
                    <td className="py-1.5 whitespace-nowrap">{formatearHora(m.creadoEn)}</td>
                    <td className="py-1.5">{ETIQUETA_TIPO_MOVIMIENTO[m.tipo]}</td>
                    <td className="py-1.5">{m.concepto}</td>
                    <td className="py-1.5">{nombrePersonal(m.usuario.personal)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {m.tipo === 'ingreso' ? '+' : '−'}
                      {formatearPrecio(m.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="evitar-corte mt-12 grid grid-cols-2 gap-10 text-center text-xs text-zinc-500">
          <div>
            <div className="border-t border-zinc-400 pt-1.5">Firma del cajero</div>
          </div>
          <div>
            <div className="border-t border-zinc-400 pt-1.5">Firma del supervisor</div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-400">
          Emitido el {formatearFechaHora(new Date().toISOString())}
        </p>
      </div>
    </div>
  );
}
