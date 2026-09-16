import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import * as comandasService from '../services/comandas.service';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { formatearFechaHora, nombreMesa } from '../utils/formato';

/**
 * Comanda de cocina para impresora térmica — mismo criterio que `TicketVenta.tsx` (ruta propia,
 * sin `AdminLayout`, `@page` de 80mm aislado). A diferencia del ticket de venta, no lleva
 * precios ni datos fiscales: es un documento interno para la cocina, no un comprobante.
 */
export function TicketComanda() {
  const { id = '' } = useParams<{ id: string }>();
  const yaImprimio = useRef(false);

  const comandaQuery = useQuery({
    queryKey: ['ticket-comanda', id],
    queryFn: () => comandasService.obtenerComanda(id),
    enabled: id.length > 0,
  });

  useEffect(() => {
    if (comandaQuery.data && !yaImprimio.current) {
      yaImprimio.current = true;
      window.print();
    }
  }, [comandaQuery.data]);

  if (comandaQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!comandaQuery.data) return null;

  const comanda = comandaQuery.data;

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

      <div className="w-[80mm] bg-white p-3 font-mono text-sm text-zinc-900 shadow-sm print:shadow-none">
        <div className="text-center">
          <p className="text-lg font-bold uppercase">Comanda de cocina</p>
          <p className="text-base font-bold">{nombreMesa(comanda.pedido.mesa)}</p>
        </div>

        <div className="my-2 border-t border-dashed border-zinc-400" />

        <p className="text-xs">{formatearFechaHora(comanda.creadoEn)}</p>
        {comanda.notas && <p className="mt-1 text-xs italic">Nota: {comanda.notas}</p>}

        <div className="my-2 border-t border-dashed border-zinc-400" />

        <ul className="flex flex-col gap-2">
          {comanda.detalles.map((detalle) => (
            <li key={detalle.id}>
              <p className="font-bold">
                {detalle.cantidad}x {detalle.producto.nombre}
              </p>
              {detalle.notas && <p className="pl-4 text-xs italic">{detalle.notas}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
