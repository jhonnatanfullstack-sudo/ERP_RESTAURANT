import { describe, expect, it } from 'vitest';
import { efectivoVentasContado, ventasEnPeriodo } from './metricas';
import type { Venta } from '../types/api';

/**
 * H17 — `efectivoVentasContado` es el helper que `Caja.tsx` (vista en vivo) y `ReporteCaja.tsx`
 * (reporte impreso) consumen directamente (ver los imports de ambos archivos) para el mismo
 * número que el backend congela en `Caja.montoEsperado` — probarlo acá prueba inequívocamente
 * lo que ambas pantallas van a mostrar, sin necesidad de renderizar ninguna de las dos.
 */
function venta(overrides: Partial<Venta> = {}): Venta {
  return {
    id: 'venta-1',
    formaPago: 'contado',
    medioPago: { id: 'mp-efectivo', codigo: 'efectivo', nombre: 'Efectivo', requiereBanco: false },
    total: 100,
    propina: 0,
    estado: 'emitida',
    creadoEn: '2026-09-29T12:00:00.000Z',
    ...overrides,
  } as unknown as Venta;
}

const medioTarjeta = { id: 'mp-tarjeta', codigo: 'tarjeta', nombre: 'Tarjeta', requiereBanco: false };

describe('H17 — efectivoVentasContado (mismo criterio que caja.service.ts: calcularVentasEfectivo)', () => {
  it('A) CONTADO + efectivo, sin propina => 100', () => {
    const resultado = efectivoVentasContado([venta({ total: 100, propina: 0 })]);
    expect(resultado).toBe(100);
  });

  it('B) CONTADO + efectivo, con propina de 10 => 110 (total + propina)', () => {
    const resultado = efectivoVentasContado([venta({ total: 100, propina: 10 })]);
    expect(resultado).toBe(110);
  });

  it('C) CONTADO + tarjeta, con propina => no entra en el efectivo de ventas', () => {
    const resultado = efectivoVentasContado([
      venta({ total: 100, propina: 10, medioPago: medioTarjeta }),
    ]);
    expect(resultado).toBe(0);
  });

  it('D) CREDITO => no entra en este cálculo, sin importar medioPago/propina', () => {
    const resultado = efectivoVentasContado([
      venta({ formaPago: 'credito', medioPago: null, total: 100, propina: 10 }),
    ]);
    expect(resultado).toBe(0);
  });

  it('E) venta anulada => no entra, en el mismo pipeline que usan Caja.tsx/ReporteCaja.tsx (ventasEnPeriodo → efectivoVentasContado)', () => {
    // `efectivoVentasContado` no filtra por estado por sí solo — ese filtro es responsabilidad
    // de `ventasEnPeriodo` (excluye `estado !== 'emitida'`), que ambos componentes SIEMPRE
    // llaman antes. Se prueba el pipeline compuesto real, no la función aislada, para que la
    // regresión sea sobre el comportamiento que efectivamente ve el usuario.
    const ventas = [venta({ total: 100, propina: 10, estado: 'anulada' })];
    const ventasSesion = ventasEnPeriodo(ventas, '2026-09-29T00:00:00.000Z', null);
    expect(efectivoVentasContado(ventasSesion)).toBe(0);
  });

  it('suma varias ventas mixtas — solo las CONTADO+efectivo aportan, cada una con su propia propina', () => {
    const resultado = efectivoVentasContado([
      venta({ id: 'v1', total: 100, propina: 10 }),
      venta({ id: 'v2', total: 50, propina: 0, medioPago: medioTarjeta }),
      venta({ id: 'v3', formaPago: 'credito', medioPago: null, total: 200, propina: 0 }),
      venta({ id: 'v4', total: 30, propina: 5 }),
    ]);
    expect(resultado).toBe(145); // (100+10) + (30+5), v2 y v3 excluidas
  });
});
