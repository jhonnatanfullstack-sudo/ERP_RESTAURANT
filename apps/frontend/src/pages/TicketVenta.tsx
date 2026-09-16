import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import * as ventasService from '../services/ventas.service';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import {
  formatearFechaHora,
  formatearPrecio,
  nombreCliente,
  nombreMesa,
  numeroComprobante,
} from '../utils/formato';

/**
 * Ticket de venta para impresora térmica (58/80mm). Vive en su propia ruta sin `AdminLayout`
 * (se abre en una pestaña nueva desde `Ventas.tsx`) para que lo único presente en el documento
 * sea el ticket: así el `@page` de 80mm de abajo no compite con el `@page` a tamaño carta que
 * usa el resto del sistema para imprimir reportes (`index.css`).
 *
 * Nunca se verificó contra una impresora térmica física en este entorno — el ancho de papel
 * depende de que el navegador/controlador respete `@page { size: 80mm auto }` (Chrome/Edge sí
 * lo hacen). Si el papel real es de 58mm, cambiar el `80mm` de ambos lados de este archivo.
 */
export function TicketVenta() {
  const { id = '' } = useParams<{ id: string }>();
  const yaImprimio = useRef(false);

  const ventaQuery = useQuery({
    queryKey: ['ticket-venta', id],
    queryFn: () => ventasService.obtenerVenta(id),
    enabled: id.length > 0,
  });

  useEffect(() => {
    if (ventaQuery.data && !yaImprimio.current) {
      yaImprimio.current = true;
      window.print();
    }
  }, [ventaQuery.data]);

  if (ventaQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!ventaQuery.data) return null;

  const venta = ventaQuery.data;
  const empresa = venta.empresa;

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-100 py-6">
      <style>{'@media print { @page { size: 80mm auto; margin: 3mm; } }'}</style>

      <div className="no-imprimir mb-4 flex gap-2">
        <Button icono={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          Imprimir
        </Button>
        <Button variante="secondary" onClick={() => window.close()}>
          Cerrar
        </Button>
      </div>

      <div className="w-[80mm] bg-white p-3 font-mono text-xs text-zinc-900 shadow-sm print:shadow-none">
        <div className="text-center">
          <p className="text-sm font-bold uppercase">
            {empresa.nombreComercial ?? empresa.razonSocial}
          </p>
          <p>RUC {empresa.ruc}</p>
          {empresa.direccionFiscal && <p>{empresa.direccionFiscal}</p>}
          {empresa.telefono && <p>Tel. {empresa.telefono}</p>}
        </div>

        <div className="my-2 border-t border-dashed border-zinc-400" />

        <div className="text-center">
          <p className="font-bold">{venta.tipoComprobante.nombre.toUpperCase()}</p>
          <p className="font-bold">{numeroComprobante(venta.serie, venta.numero)}</p>
        </div>

        <div className="my-2 border-t border-dashed border-zinc-400" />

        <p>Fecha: {formatearFechaHora(venta.creadoEn)}</p>
        <p>Cliente: {nombreCliente(venta.cliente)}</p>
        {venta.cliente?.numeroDocumento && (
          <p>
            {venta.cliente.tipoDocumentoIdentidad?.nombre}: {venta.cliente.numeroDocumento}
          </p>
        )}
        {venta.pedido && <p>Mesa: {nombreMesa(venta.pedido.mesa)}</p>}

        <div className="my-2 border-t border-dashed border-zinc-400" />

        <ul className="flex flex-col gap-1">
          {venta.detalles.map((detalle) => (
            <li key={detalle.id} className="flex justify-between gap-2">
              <span>
                {detalle.cantidad}x {detalle.descripcionProducto}
              </span>
              <span className="shrink-0">{formatearPrecio(detalle.subtotal)}</span>
            </li>
          ))}
        </ul>

        <div className="my-2 border-t border-dashed border-zinc-400" />

        <div className="flex flex-col gap-0.5">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatearPrecio(venta.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>IGV</span>
            <span>{formatearPrecio(venta.igv)}</span>
          </div>
          {venta.propina > 0 && (
            <div className="flex justify-between">
              <span>Propina</span>
              <span>{formatearPrecio(venta.propina)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold">
            <span>TOTAL</span>
            <span>{formatearPrecio(venta.total + venta.propina)}</span>
          </div>
        </div>

        <div className="my-2 border-t border-dashed border-zinc-400" />

        <p className="text-center">¡Gracias por su preferencia!</p>
      </div>
    </div>
  );
}
