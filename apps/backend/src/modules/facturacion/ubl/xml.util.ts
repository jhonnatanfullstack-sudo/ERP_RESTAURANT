/**
 * Utilidades para armar el XML UBL 2.1 a mano. Se construye con plantillas en vez de una
 * librería de XML porque la estructura que exige SUNAT es fija y verbosa: un builder genérico
 * no evita ningún error real (el orden de los elementos y los `listID` son lo que SUNAT
 * valida) y sí agrega una dependencia más. Lo que sí es innegociable es escapar el texto,
 * porque la razón social o la descripción de un plato pueden traer `&`, `<` o comillas.
 */

/** Escapa texto para que sea contenido válido de un elemento o atributo XML. */
export function escaparXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Importes con exactamente 2 decimales, como exige SUNAT para los totales. */
export function monto(valor: number): string {
  return valor.toFixed(2);
}

/** Cantidades y precios unitarios admiten más precisión que los importes totales. */
export function cantidad(valor: number): string {
  return valor.toFixed(10).replace(/0+$/, '').replace(/\.$/, '.0');
}

const UNIDADES = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISEIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
];
const DECENAS = [
  '',
  '',
  'VEINTI',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
];
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];

function centenasALetras(numero: number): string {
  if (numero === 100) return 'CIEN';
  const centena = Math.floor(numero / 100);
  const resto = numero % 100;
  const partes = [CENTENAS[centena]];

  if (resto <= 20) {
    partes.push(UNIDADES[resto]);
  } else {
    const decena = Math.floor(resto / 10);
    const unidad = resto % 10;
    // "VEINTIUNO" va junto; de treinta en adelante es "TREINTA Y UNO".
    partes.push(
      decena === 2
        ? `${DECENAS[2]}${UNIDADES[unidad].toLowerCase()}`.toUpperCase()
        : unidad === 0
          ? DECENAS[decena]
          : `${DECENAS[decena]} Y ${UNIDADES[unidad]}`,
    );
  }

  return partes.filter(Boolean).join(' ');
}

/**
 * Monto en letras que SUNAT exige como leyenda 1000 del comprobante, con el formato
 * habitual: "CIENTO VEINTITRES CON 45/100 SOLES". Cubre hasta millones, de sobra para el
 * ticket de un restaurante.
 */
export function montoEnLetras(valor: number, moneda = 'SOLES'): string {
  const entero = Math.floor(valor);
  const centimos = Math.round((valor - entero) * 100);

  if (entero === 0) return `CERO CON ${String(centimos).padStart(2, '0')}/100 ${moneda}`;

  const bloques: string[] = [];
  const millones = Math.floor(entero / 1_000_000);
  const miles = Math.floor((entero % 1_000_000) / 1000);
  const resto = entero % 1000;

  if (millones > 0) {
    bloques.push(millones === 1 ? 'UN MILLON' : `${centenasALetras(millones)} MILLONES`);
  }
  if (miles > 0) {
    bloques.push(miles === 1 ? 'MIL' : `${centenasALetras(miles)} MIL`);
  }
  if (resto > 0) {
    bloques.push(centenasALetras(resto));
  }

  return `${bloques.join(' ')} CON ${String(centimos).padStart(2, '0')}/100 ${moneda}`;
}

/** Fecha `YYYY-MM-DD` en hora de Lima: SUNAT valida la fecha de emisión contra el día local,
 * y `toISOString()` la correría al día siguiente para cualquier venta de la noche. */
export function fechaEmision(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

/** Hora `HH:MM:SS` en Lima, por el mismo motivo que `fechaEmision`. */
export function horaEmision(fecha: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(fecha);
}
