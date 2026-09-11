/**
 * Códigos de los catálogos SUNAT que la lógica de negocio necesita nombrar. Viven aquí, junto
 * a las entidades de catálogo, para que Ventas y Talonarios compartan la misma constante en
 * vez de repetir el literal en cada módulo (Regla 7 de CLAUDE.md).
 */

/** Catálogo N° 01 — Tipo de comprobante de pago. */
export const CODIGO_FACTURA = '01';
export const CODIGO_BOLETA = '03';

/** Letra inicial que SUNAT exige en la serie según el comprobante (RS 097-2012/SUNAT):
 * las series electrónicas de factura empiezan con F y las de boleta con B. */
export const LETRA_SERIE_POR_COMPROBANTE: Record<string, string> = {
  [CODIGO_FACTURA]: 'F',
  [CODIGO_BOLETA]: 'B',
};
