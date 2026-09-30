import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReporteCaja } from './ReporteCaja';
import * as cajaService from '../services/caja.service';
import * as ventasService from '../services/ventas.service';
import * as cobranzasService from '../services/cobranzas.service';
import * as empresaService from '../services/empresa.service';
import type { Caja, Venta } from '../types/api';

/**
 * H17 — RED: `ReporteCaja.tsx` (y `Caja.tsx`, que comparte exactamente el mismo criterio)
 * calcula "Ventas al contado en efectivo" como `venta.total`, sin sumar `venta.propina` —
 * mientras que el backend (`caja.service.ts: calcularVentasEfectivo`, la fuente autoritativa
 * que congela `Caja.montoEsperado` al cerrar) sí la suma: `venta.total + venta.propina`.
 *
 * Esta prueba renderiza el reporte de una sesión YA CERRADA: en ese caso `efectivoEsperado`
 * (el total impreso) viene directamente de `caja.montoEsperado` — el valor autoritativo del
 * backend, que aquí se fija en 110 (100 de la cuenta + 10 de propina, ambos en efectivo) para
 * simular exactamente lo que el backend real habría calculado y persistido. El defecto se
 * demuestra sin ambigüedad: la fila "+ Ventas al contado en efectivo" (recalculada en el
 * propio componente, sin pasar por el backend) muestra 100 en vez de 110 — un desglose que no
 * suma con el total impreso en el mismo papel.
 */

const usuarioMinimo = {
  id: 'u1',
  personal: {
    id: 'p1',
    nombres: 'Ana',
    apellidoPaterno: 'Cajera',
    apellidoMaterno: null,
    razonSocial: null,
  },
};

function ventaContadoEfectivoConPropina(overrides: Partial<Venta> = {}): Venta {
  return {
    id: 'venta-1',
    formaPago: 'contado',
    medioPago: { id: 'mp-efectivo', codigo: 'efectivo', nombre: 'Efectivo', requiereBanco: false },
    total: 100,
    propina: 10,
    estado: 'emitida',
    creadoEn: '2026-09-29T12:00:00.000Z',
    ...overrides,
  } as unknown as Venta;
}

function cajaCerradaConMontoEsperadoAutoritativo(overrides: Partial<Caja> = {}): Caja {
  return {
    id: 'caja-1',
    usuarioApertura: usuarioMinimo,
    usuarioCierre: usuarioMinimo,
    montoApertura: 0,
    observacionApertura: null,
    // Valor que el backend real (`caja.service.ts: calcularEfectivoDisponible`) habría
    // calculado y congelado para esta sesión: 0 (apertura) + 100 (venta.total) + 10
    // (venta.propina, cobrada en efectivo) = 110.
    montoEsperado: 110,
    montoDeclarado: 110,
    diferencia: 0,
    observacionCierre: null,
    estado: 'cerrada',
    movimientos: [],
    creadoEn: '2026-09-29T08:00:00.000Z',
    fechaCierre: '2026-09-29T20:00:00.000Z',
    ...overrides,
  } as unknown as Caja;
}

function renderizar() {
  vi.spyOn(cajaService, 'obtenerCaja').mockResolvedValue(cajaCerradaConMontoEsperadoAutoritativo());
  vi.spyOn(ventasService, 'listarVentas').mockResolvedValue([ventaContadoEfectivoConPropina()]);
  vi.spyOn(cobranzasService, 'listarCuentasPorCobrar').mockResolvedValue([]);
  vi.spyOn(empresaService, 'listarEmpresas').mockResolvedValue([]);

  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/reportes/caja/caja-1']}>
        <Routes>
          <Route path="/reportes/caja/:id" element={<ReporteCaja />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Extrae el monto (numérico) de la fila cuya primera celda contiene `etiqueta`. */
function montoDeLaFila(etiqueta: string): number {
  const celdaEtiqueta = screen.getByText(etiqueta);
  const fila = celdaEtiqueta.closest('tr');
  if (!fila) throw new Error(`No se encontró la fila de "${etiqueta}"`);
  const celdaMonto = fila.querySelectorAll('td')[1];
  if (!celdaMonto) throw new Error(`La fila de "${etiqueta}" no tiene celda de monto`);
  // El formato es moneda ("S/ 100.00" o similar según el Intl del entorno) — se extrae solo
  // el número, sin asumir el símbolo/espaciado exacto de `Intl.NumberFormat`.
  const numeros = celdaMonto.textContent?.match(/[\d.,]+/)?.[0] ?? '';
  return Number(numeros.replace(/,/g, ''));
}

describe('H17 — ReporteCaja: desglose de ventas en efectivo debe incluir la propina', () => {
  it('el backend congela 110 (venta.total + propina) en montoEsperado, pero la fila de desglose recalculada en el frontend muestra solo 100 (sin propina)', async () => {
    renderizar();

    // El total impreso ("Total esperado") viene de `caja.montoEsperado`, el valor autoritativo
    // del backend — 110, correcto.
    expect(await montoDeLaFilaAsync('Total esperado')).toBe(110);

    // El desglose "+ Ventas al contado en efectivo" se recalcula en el propio componente
    // (`ReporteCaja.tsx`, mismo criterio que `Caja.tsx`) SIN sumar `venta.propina` — debería
    // ser 110 (100 + 10), igual que el total autoritativo, pero hoy es 100.
    const efectivoVentasMostrado = montoDeLaFila('+ Ventas al contado en efectivo');
    expect(efectivoVentasMostrado).toBe(110);
  });
});

/** Espera a que el reporte termine de cargar (deja de mostrar el spinner) antes de leer la fila. */
async function montoDeLaFilaAsync(etiqueta: string): Promise<number> {
  await screen.findByText(etiqueta);
  return montoDeLaFila(etiqueta);
}
