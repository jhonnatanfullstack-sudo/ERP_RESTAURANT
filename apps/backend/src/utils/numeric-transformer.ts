import type { ValueTransformer } from 'typeorm';

/** TypeORM devuelve las columnas `numeric` como string; este transformer las expone como number. */
export const numericTransformer: ValueTransformer = {
  to: (valor: number) => valor,
  from: (valor: string) => Number(valor),
};
