/**
 * Códigos de los catálogos SUNAT que la lógica de negocio necesita nombrar. Viven aquí, junto
 * a las entidades de catálogo, para que Ventas y Talonarios compartan la misma constante en
 * vez de repetir el literal en cada módulo (Regla 7 de CLAUDE.md).
 */

/** Catálogo N° 01 — Tipo de comprobante de pago. */
export const CODIGO_FACTURA = '01';
export const CODIGO_BOLETA = '03';
export const CODIGO_GUIA_REMISION = '09';

/** Letra inicial que SUNAT exige en la serie según el comprobante (RS 097-2012/SUNAT):
 * las series electrónicas de factura empiezan con F, las de boleta con B y las de guía de
 * remisión del remitente con T. */
export const LETRA_SERIE_POR_COMPROBANTE: Record<string, string> = {
  [CODIGO_FACTURA]: 'F',
  [CODIGO_BOLETA]: 'B',
  [CODIGO_GUIA_REMISION]: 'T',
};

/** DNI reservado (no corresponde a una persona real) que identifica al "Cliente Varios"/
 * "Proveedor Varios" de cada empresa — el registro genérico que se preselecciona en
 * Pedidos/Ventas/Compras para no obligar a registrar a la contraparte real en cada operación
 * (ver `demo.service.ts` y `BuscadorCliente`/`BuscadorProveedor` en el frontend, que deben usar
 * el mismo valor). */
export const NUMERO_DOCUMENTO_VARIOS = '99999999';
