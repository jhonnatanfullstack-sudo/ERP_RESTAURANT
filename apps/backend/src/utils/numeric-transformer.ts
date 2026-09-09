import type { ValueTransformer } from 'typeorm';

/** TypeORM devuelve las columnas `numeric` como string; este transformer las expone como number.
 * Preserva `null` en columnas anulables — `Number(null)` da `0`, no `null`, lo que convertiría
 * silenciosamente "todavía no se calculó" (ej. `Caja.montoEsperado` antes de cerrar) en "es
 * cero" (bug real encontrado en FASE 15, ver `decisiones-tecnicas.md`). */
export const numericTransformer: ValueTransformer = {
  to: (valor: number | null) => valor,
  from: (valor: string | null) => (valor === null ? null : Number(valor)),
};
