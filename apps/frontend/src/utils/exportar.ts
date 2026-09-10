/**
 * Exportación de tablas a archivo. Se genera en el navegador (no hay endpoint que devuelva
 * archivos) porque los datos ya están en pantalla: pedirlos otra vez al servidor solo para
 * armar el mismo CSV sería un viaje de red de más.
 */

/** Excel en configuración regional española interpreta la coma como separador decimal: con
 * `,` como separador de columnas pega toda la fila en una sola celda. El `;` es el separador
 * que espera, y el BOM le indica que el archivo es UTF-8 (sin él rompe las tildes y la ñ). */
const SEPARADOR = ';';
const BOM_UTF8 = '﻿';

function escapar(valor: string | number | null | undefined): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  // Comillas dobles duplicadas y el campo entre comillas: regla estándar de CSV (RFC 4180).
  return `"${texto.replace(/"/g, '""')}"`;
}

function descargar(contenido: BlobPart, nombreArchivo: string, tipoMime: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipoMime }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

export interface ColumnaExportable<T> {
  encabezado: string;
  valor: (fila: T) => string | number | null;
}

/**
 * Descarga las filas como CSV listo para abrir en Excel / Google Sheets. No genera un `.xlsx`
 * real (eso requeriría una librería de terceros): un CSV con `;` y BOM se abre en columnas
 * correctamente en Excel y conserva las tildes.
 */
export function exportarCsv<T>(
  nombreArchivo: string,
  columnas: ColumnaExportable<T>[],
  filas: T[],
): void {
  const lineas = [
    columnas.map((columna) => escapar(columna.encabezado)).join(SEPARADOR),
    ...filas.map((fila) =>
      columnas.map((columna) => escapar(columna.valor(fila))).join(SEPARADOR),
    ),
  ];
  descargar(`${BOM_UTF8}${lineas.join('\r\n')}`, `${nombreArchivo}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * Abre el diálogo de impresión del navegador, desde donde se puede guardar como PDF. Se
 * prefiere a generar el PDF con una librería: el navegador ya sabe paginar y respeta las
 * reglas `@media print` de la hoja de estilos (ver `index.css`), así que el PDF sale con el
 * mismo diseño que la pantalla, sin sumar dependencias ni mantener una segunda maquetación.
 */
export function imprimir(): void {
  window.print();
}
