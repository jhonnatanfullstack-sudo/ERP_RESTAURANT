import { describe, expect, it, vi, afterEach } from 'vitest';
import forge from 'node-forge';
import { construirXmlFactura } from '../src/modules/facturacion/ubl/factura.builder';
import { NubefactOseProvider } from '../src/modules/facturacion/ose/nubefact-ose.provider';
import * as cobranzaService from '../src/modules/cobranzas/cobranza.service';
import * as suscripcionService from '../src/modules/suscripcion/suscripcion.service';
import { FormaPago } from '../src/modules/ventas/venta.entity';
import { AppDataSource } from '../src/database/data-source';
import { api, empresaConProducto } from './ayudantes';
import type { ResultadoOse } from '../src/modules/facturacion/ose/ose-provider.interface';
import type { Venta } from '../src/modules/ventas/venta.entity';
import type { DetalleVenta } from '../src/modules/ventas/detalle-venta.entity';
import type {
  CuotaComprobante,
  DatosEmpresaFiscal,
} from '../src/modules/facturacion/ubl/factura.builder';
import type { QueryRunner } from 'typeorm';

/**
 * H15-A — RED: PaymentTerms (SUNAT, RS N.° 193-2020, Anexo IV / Anexo N.° 9-A "Estándar
 * UBL 2.1", tabla "a) Factura Electrónica – UBL 2.1", datos 170-173) ausente en el XML UBL 2.1
 * que genera `factura.builder.ts` para ventas al crédito.
 *
 * Estructura oficial verificada (texto verbatim del PDF publicado en sunat.gob.pe, no
 * inferida): https://www.sunat.gob.pe/legislacion/superin/2020/anexo4-193-2020.pdf
 *
 *   Dato 170 — forma de pago al CONTADO (un solo `PaymentTerms`, exactamente estos 2 campos):
 *     /Invoice/cac:PaymentTerms/cbc:ID              = "FormaPago"
 *     /Invoice/cac:PaymentTerms/cbc:PaymentMeansID  = "Contado"
 *
 *   Dato 171 — forma de pago al CRÉDITO + monto neto pendiente de pago (un `PaymentTerms`
 *   general, distinto de cada cuota):
 *     /Invoice/cac:PaymentTerms/cbc:ID              = "FormaPago"
 *     /Invoice/cac:PaymentTerms/cbc:PaymentMeansID  = "Credito"
 *     /Invoice/cac:PaymentTerms/cbc:Amount          = <monto neto pendiente de pago> n(12,2)
 *       @currencyID (Catálogo N.° 02, ej. "PEN")
 *
 *   Datos 172/173 — monto y fecha de vencimiento de cada cuota (un `PaymentTerms` POR CADA
 *   cuota, con el mismo `cbc:ID`="FormaPago" que los anteriores — lo que distingue una cuota es
 *   `cbc:PaymentMeansID`):
 *     /Invoice/cac:PaymentTerms/cbc:ID              = "FormaPago"
 *     /Invoice/cac:PaymentTerms/cbc:PaymentMeansID  = "Cuota<NNN>" (ej. "Cuota001", "Cuota010")
 *     /Invoice/cac:PaymentTerms/cbc:Amount          = <monto de esa cuota> n(12,2)
 *       @currencyID (Catálogo N.° 02)
 *     /Invoice/cac:PaymentTerms/cbc:PaymentDueDate  = <fecha de vencimiento de esa cuota>
 *       YYYY-MM-DD
 *
 * Es decir: para CONTADO, 1 bloque `PaymentTerms`; para CRÉDITO con N cuotas, 1 + N bloques
 * (el general "Credito" + uno por cuota). Ningún campo de propinas/medio de pago participa acá.
 *
 * `apps/backend/src/modules/cobranzas/cuota-venta.entity.ts` ya documenta que el cronograma
 * PACTADO (número, monto, fecha de vencimiento) vive en `CuotaVenta`, y que lo efectivamente
 * cobrado después vive en `PagoVenta` — dos cosas distintas. Estos tests fijan el contrato del
 * XML usando `CuotaVenta` como única fuente conceptual; RED-05 demuestra además, en
 * integración real, que una cobranza (`PagoVenta`) registrada antes de emitir no debe alterar
 * ni sustituir ese cronograma.
 *
 * H15-B (GREEN): `construirXmlFactura` ahora recibe `cuotas: CuotaComprobante[]` explícitamente
 * (tipo liviano, no la `Entity` `CuotaVenta` — ver `factura.builder.ts`) y lee `venta.formaPago`
 * para decidir cuántos bloques emitir. RED-01 a RED-04 pasan ese cronograma "a mano" (fixtures
 * aisladas, sin BD) para verificar el contrato de serialización de forma determinista; quien
 * realmente decide de dónde sale ese cronograma en producción es `facturacion.service.ts`
 * (`cargarCuotasPactadas`), que lo carga desde `CuotaVenta` — nunca desde `PagoVenta` — y
 * únicamente durante la emisión inicial (jamás en un reintento, H13-B). Los valores de cada
 * escenario (S/100, "2026-10-15", etc.) son ilustrativos, elegidos para que coincidan con lo que
 * `generarCuotas`/`guardarCuotas` (`cobranza.service.ts`) ya calcularían en ese mismo escenario.
 *
 * H15-06 y H15-07 (agregados en H15-B) verifican, en integración real, las dos garantías que no
 * se pueden probar contra el builder aislado: que una venta a crédito sin `CuotaVenta` se
 * rechaza antes de tocar el OSE, y que un reintento de `ERROR_ENVIO` sigue reutilizando el XML
 * ya firmado aunque el cronograma pactado cambie después (protección explícita de H13-B).
 */

const TASA_IGV = 0.18;

/** H16: estas fixtures aisladas del builder ya construyen directamente el `DatosEmpresaFiscal`
 * resuelto (nunca una `Empresa` completa) — es exactamente lo que `facturacion.service.ts`
 * (`resolverDatosEmpresaFiscal`) le entrega hoy al builder real. */
function empresaFiscalFixture(): DatosEmpresaFiscal {
  return {
    ruc: '20123456789',
    razonSocial: 'RESTAURANTE DE PRUEBA SAC',
    nombreComercial: 'RESTAURANTE DE PRUEBA',
    ubigeo: '150101',
    direccionFiscal: 'AV. DE PRUEBA 123',
  };
}

function detalleFixture(): DetalleVenta {
  return {
    descripcionProducto: 'PLATO DE PRUEBA',
    cantidad: 1,
    precioUnitario: 100,
    valorVenta: 84.75,
    igv: 15.25,
    subtotal: 100,
    tipoAfectacionIgv: { codigo: '10' },
    producto: { unidadMedida: { codigo: 'NIU' } },
  } as unknown as DetalleVenta;
}

/** Venta mínima suficiente para que `construirXmlFactura` no falle — sin pasar por HTTP/BD,
 * para que RED-01 a RED-04 sean deterministas y aisladas (no dependen de turnos, catálogos ni
 * de la base de datos). */
function ventaFixture(overrides: Partial<Venta> = {}): Venta {
  return {
    id: 'venta-fixture-h15',
    serie: 'B001',
    numero: 1,
    tipoComprobante: { codigo: '03' },
    tipoOperacion: { codigo: '0101' },
    cliente: null,
    formaPago: FormaPago.CONTADO,
    subtotal: 84.75,
    igv: 15.25,
    total: 100,
    propina: 0,
    creadoEn: new Date('2026-09-15T15:00:00-05:00'),
    detalles: [detalleFixture()],
    ...overrides,
  } as unknown as Venta;
}

/** Extrae cada bloque `<cac:PaymentTerms>...</cac:PaymentTerms>` tal cual aparece en el XML,
 * en orden — permite verificar cardinalidad y contenido sin depender de indentación exacta. */
function bloquesPaymentTerms(xml: string): string[] {
  return xml.match(/<cac:PaymentTerms>[\s\S]*?<\/cac:PaymentTerms>/g) ?? [];
}

describe('H15 — PaymentTerms UBL 2.1 en factura.builder.ts (RS 193-2020/SUNAT, Anexo IV)', () => {
  it('H15-RED-01: venta CONTADO — un único PaymentTerms con FormaPago/Contado, sin Amount ni PaymentDueDate', () => {
    const venta = ventaFixture({ formaPago: FormaPago.CONTADO });
    const xml = construirXmlFactura({ venta, empresaFiscal: empresaFiscalFixture(), clienteFiscal: null, tasaIgv: TASA_IGV, cuotas: [] });

    const bloques = bloquesPaymentTerms(xml);
    expect(bloques).toHaveLength(1);
    expect(bloques[0]).toContain('<cbc:ID>FormaPago</cbc:ID>');
    expect(bloques[0]).toContain('<cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>');
    // Dato 170 del Anexo IV: al contado NO se declara Amount ni PaymentDueDate.
    expect(bloques[0]).not.toContain('cbc:Amount');
    expect(bloques[0]).not.toContain('cbc:PaymentDueDate');
  });

  it('H15-RED-02: venta CREDITO de S/100 con una cuota — PaymentTerms Credito (monto pendiente) + Cuota001 (importe y vencimiento)', () => {
    // Escenario ilustrativo: crédito de S/100, una sola cuota, vence 2026-10-15 — equivalente a
    // lo que `guardarCuotas`/`generarCuotas` (cobranza.service.ts) ya generaría hoy en
    // `CuotaVenta` para `numeroCuotas=1`.
    const venta = ventaFixture({ formaPago: FormaPago.CREDITO, total: 100 });
    const cuotas: CuotaComprobante[] = [{ numero: 1, monto: 100, fechaVencimiento: '2026-10-15' }];
    const xml = construirXmlFactura({ venta, empresaFiscal: empresaFiscalFixture(), clienteFiscal: null, tasaIgv: TASA_IGV, cuotas });

    const bloques = bloquesPaymentTerms(xml);
    // Dato 171 (general Credito) + datos 172/173 (Cuota001) = 2 bloques.
    expect(bloques).toHaveLength(2);

    const [general, cuota1] = bloques;
    expect(general).toContain('<cbc:ID>FormaPago</cbc:ID>');
    expect(general).toContain('<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>');
    expect(general).toMatch(/<cbc:Amount currencyID="PEN">100\.00<\/cbc:Amount>/);
    expect(general).not.toContain('cbc:PaymentDueDate');

    expect(cuota1).toContain('<cbc:ID>FormaPago</cbc:ID>');
    expect(cuota1).toContain('<cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>');
    expect(cuota1).toMatch(/<cbc:Amount currencyID="PEN">100\.00<\/cbc:Amount>/);
    expect(cuota1).toContain('<cbc:PaymentDueDate>2026-10-15</cbc:PaymentDueDate>');
  });

  it('H15-RED-03: venta CREDITO con múltiples cuotas — un PaymentTerms por cada cuota, en orden, con montos y vencimientos propios', () => {
    // Escenario ilustrativo: S/100.01 en 3 cuotas mensuales desde 2026-10-15 — mismos montos
    // que ya calcularía hoy `generarCuotas` (33.33/33.33/33.35, la última absorbe el redondeo)
    // y las mismas fechas que ya calcularía `sumarMeses` (cobranza.service.ts).
    //
    // Se pasan deliberadamente DESORDENADAS (3, 1, 2): el builder debe reordenar por `numero`
    // de forma defensiva, sin confiar en el orden del arreglo de entrada. Esto es lo que
    // justifica no duplicar un H15-08 aparte para "orden determinista" — este mismo test ya lo
    // demuestra sin ambigüedad, porque si el builder NO reordenara, cuota1/cuota2/cuota3 abajo
    // saldrían en el orden de entrada (3, 1, 2) y las aserciones de PaymentDueDate fallarían.
    const venta = ventaFixture({ formaPago: FormaPago.CREDITO, total: 100.01 });
    const cuotas: CuotaComprobante[] = [
      { numero: 3, monto: 33.35, fechaVencimiento: '2026-12-15' },
      { numero: 1, monto: 33.33, fechaVencimiento: '2026-10-15' },
      { numero: 2, monto: 33.33, fechaVencimiento: '2026-11-15' },
    ];
    const xml = construirXmlFactura({ venta, empresaFiscal: empresaFiscalFixture(), clienteFiscal: null, tasaIgv: TASA_IGV, cuotas });

    const bloques = bloquesPaymentTerms(xml);
    // 1 general (Credito) + 3 cuotas = 4 bloques.
    expect(bloques).toHaveLength(4);

    const [general, cuota1, cuota2, cuota3] = bloques;
    expect(general).toContain('<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>');
    expect(general).toMatch(/<cbc:Amount currencyID="PEN">100\.01<\/cbc:Amount>/);

    expect(cuota1).toContain('<cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>');
    expect(cuota1).toMatch(/<cbc:Amount currencyID="PEN">33\.33<\/cbc:Amount>/);
    expect(cuota1).toContain('<cbc:PaymentDueDate>2026-10-15</cbc:PaymentDueDate>');

    expect(cuota2).toContain('<cbc:PaymentMeansID>Cuota002</cbc:PaymentMeansID>');
    expect(cuota2).toMatch(/<cbc:Amount currencyID="PEN">33\.33<\/cbc:Amount>/);
    expect(cuota2).toContain('<cbc:PaymentDueDate>2026-11-15</cbc:PaymentDueDate>');

    expect(cuota3).toContain('<cbc:PaymentMeansID>Cuota003</cbc:PaymentMeansID>');
    expect(cuota3).toMatch(/<cbc:Amount currencyID="PEN">33\.35<\/cbc:Amount>/);
    expect(cuota3).toContain('<cbc:PaymentDueDate>2026-12-15</cbc:PaymentDueDate>');
  });

  it('H15-RED-04: todo cbc:Amount dentro de PaymentTerms declara currencyID (Catálogo N.° 02) — nunca un monto sin moneda', () => {
    const venta = ventaFixture({ formaPago: FormaPago.CREDITO, total: 100.01 });
    const cuotas: CuotaComprobante[] = [
      { numero: 1, monto: 33.33, fechaVencimiento: '2026-10-15' },
      { numero: 2, monto: 33.33, fechaVencimiento: '2026-11-15' },
      { numero: 3, monto: 33.35, fechaVencimiento: '2026-12-15' },
    ];
    const xml = construirXmlFactura({ venta, empresaFiscal: empresaFiscalFixture(), clienteFiscal: null, tasaIgv: TASA_IGV, cuotas });

    const bloques = bloquesPaymentTerms(xml);
    expect(bloques.length).toBeGreaterThan(0); // si esto falla, ver RED-02/03 primero.

    for (const bloque of bloques) {
      const montos = bloque.match(/<cbc:Amount[^>]*>/g) ?? [];
      expect(montos.length).toBeGreaterThan(0);
      for (const etiquetaAmount of montos) {
        expect(etiquetaAmount).toMatch(/currencyID="PEN"/);
      }
    }
  });
});

/**
 * H15-RED-05 — no puede probarse de forma aislada en `factura.builder.ts` porque, HOY, el
 * builder no lee ni `CuotaVenta` ni `PagoVenta`: no hay nada que "confundir" todavía a ese
 * nivel. La garantía de "el cronograma sale de CuotaVenta, nunca de PagoVenta" solo se puede
 * demostrar en integración, una vez que existe un flujo real de emisión que además tenga una
 * cobranza parcial ya registrada — por eso este test pasa por la API real completa (creación de
 * venta, cobranza, emisión) y verifica el XML persistido (`xmlFirmado`).
 */
function crearPfxDePrueba(contrasena: string): Buffer {
  const par = forge.pki.rsa.generateKeyPair(1024);
  const certificado = forge.pki.createCertificate();
  certificado.publicKey = par.publicKey;
  certificado.serialNumber = '01';
  certificado.validity.notBefore = new Date();
  certificado.validity.notAfter = new Date();
  certificado.validity.notAfter.setFullYear(certificado.validity.notBefore.getFullYear() + 1);
  const atributos = [{ name: 'commonName', value: 'EMPRESA DE PRUEBA H15' }];
  certificado.setSubject(atributos);
  certificado.setIssuer(atributos);
  certificado.sign(par.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, certificado, contrasena, {
    algorithm: '3des',
  });
  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}

const CONTRASENA_CERTIFICADO = 'ClaveDePruebaH15123';
const PFX_DE_PRUEBA = crearPfxDePrueba(CONTRASENA_CERTIFICADO);

let espiaOse: ReturnType<typeof vi.spyOn> | null = null;
let espiaMontoPendiente: ReturnType<typeof vi.spyOn> | null = null;
let espiaRegistrarUso: ReturnType<typeof vi.spyOn> | null = null;
afterEach(() => {
  espiaOse?.mockRestore();
  espiaOse = null;
  espiaMontoPendiente?.mockRestore();
  espiaMontoPendiente = null;
  espiaRegistrarUso?.mockRestore();
  espiaRegistrarUso = null;
});

/** Mismo patrón de barrera que `facturacion-h13b.test.ts: crearBarrera` — no se importa desde
 * ahí porque es un archivo de tests independiente (mismo criterio que la duplicación del
 * certificado de prueba entre `facturacion-h13b1.test.ts` y este archivo). */
function crearBarrera() {
  let liberar!: () => void;
  const promesaLiberacion = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let marcarAlcanzado!: () => void;
  const promesaAlcanzado = new Promise<void>((resolve) => {
    marcarAlcanzado = resolve;
  });
  return { promesaLiberacion, liberar, promesaAlcanzado, marcarAlcanzado };
}

function mockearRespuestaOse(resultado: ResultadoOse) {
  espiaOse = vi.spyOn(NubefactOseProvider.prototype, 'enviarComprobante').mockResolvedValue(resultado);
  return espiaOse;
}

async function empresaConFacturacionConfigurada(precio = 100) {
  const { sesion, catalogos, productoId } = await empresaConProducto(precio);

  await api
    .put('/api/facturacion/configuracion', sesion, {
      oseProveedor: 'nubefact',
      oseUsuario: 'usuario-prueba-h15',
      oseClave: 'clave-prueba-h15',
      ambiente: 'beta',
      activo: true,
    })
    .expect(200);

  const { default: request } = await import('supertest');
  const { app } = await import('../src/app.js');
  await request(app)
    .post('/api/facturacion/configuracion/certificado')
    .set(sesion.h)
    .field('contrasena', CONTRASENA_CERTIFICADO)
    .attach('certificado', PFX_DE_PRUEBA, 'certificado.pfx')
    .expect(200);

  return { sesion, catalogos, productoId };
}

describe('H15-RED-05 — el cronograma del comprobante debe salir de CuotaVenta, nunca de PagoVenta (integración)', () => {
  it('una cobranza parcial registrada antes de emitir no debe alterar ni sustituir el cronograma pactado en el XML', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 1,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;
    const totalVenta = venta.body.data.total as number;

    // Cobranza PARCIAL registrada ANTES de la primera emisión — exactamente el escenario que
    // H15 advierte no confundir: esto no es una cuota pactada, es dinero ya cobrado.
    await api
      .post(`/api/cuentas-por-cobrar/${ventaId}/pagos`, sesion, {
        fechaPago: '2026-09-20',
        monto: Math.round(totalVenta * 0.3 * 100) / 100,
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);

    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    expect(emitida.body.data.estado).toBe('aceptado');

    const xml = emitida.body.data.xmlFirmado as string;
    const bloques = bloquesPaymentTerms(xml);

    // Exactamente 2 (general Credito + Cuota001 pactada) — ninguno originado en el pago parcial.
    expect(bloques).toHaveLength(2);
    const cuota1 = bloques[1];
    expect(cuota1).toContain('<cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>');
    // Vencimiento PACTADO (2026-10-15), nunca la fecha del pago (2026-09-20).
    expect(cuota1).toContain('<cbc:PaymentDueDate>2026-10-15</cbc:PaymentDueDate>');
    expect(xml).not.toContain('2026-09-20');
    // Importe pactado de la cuota (100% de la venta, una sola cuota) — no el 30% ya cobrado.
    expect(cuota1).toMatch(new RegExp(`<cbc:Amount currencyID="PEN">${totalVenta.toFixed(2)}</cbc:Amount>`));
  });
});

/**
 * Helpers de manipulación directa (bypass RLS) — mismo patrón que
 * `leerComprobantesDeVentaDirecto` en `facturacion-h13b1.test.ts`: sin `empresa_id` fijado, RLS
 * no dejaría ver ni tocar ninguna fila, y estos dos escenarios (H15-06, H15-07) necesitan
 * simular datos que el flujo normal de la API nunca produce por sí solo — una venta a crédito
 * cuyo cronograma se perdió (ej. dato histórico previo a este módulo) y un cronograma que
 * cambia DESPUÉS de un intento de emisión fallido.
 */
async function conBypassRls<T>(accion: (queryRunner: QueryRunner) => Promise<T>): Promise<T> {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    const resultado = await accion(queryRunner);
    await queryRunner.commitTransaction();
    return resultado;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function eliminarCuotasDeVenta(ventaId: string): Promise<void> {
  await conBypassRls((qr) => qr.query(`DELETE FROM "cuotas_venta" WHERE "venta_id" = $1`, [ventaId]));
}

async function cambiarVencimientoDeCuota(ventaId: string, numero: number, nuevaFecha: string): Promise<void> {
  await conBypassRls((qr) =>
    qr.query(
      `UPDATE "cuotas_venta" SET "fecha_vencimiento" = $1 WHERE "venta_id" = $2 AND "numero" = $3`,
      [nuevaFecha, ventaId, numero],
    ),
  );
}

describe('H15-06 — una venta al crédito sin cuotas registradas se rechaza antes de tocar el OSE', () => {
  it('no firma, no persiste comprobante ni llama al OSE si CuotaVenta está vacío', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    const espia = mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 1,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // Simula un cronograma inexistente (ej. una venta histórica previa a `CuotaVenta`, o una
    // fila borrada por error): la API normal siempre genera al menos 1 cuota para toda venta al
    // crédito, así que esto no se puede lograr sin manipulación directa.
    await eliminarCuotasDeVenta(ventaId);

    const respuesta = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion);
    expect(respuesta.status).toBe(409);
    expect(espia).not.toHaveBeenCalled();

    // No debe haber quedado ningún comprobante a medio crear (ni ENVIANDO ni ninguna XML nueva).
    const comprobante = await api.get(`/api/facturacion/ventas/${ventaId}`, sesion).expect(200);
    expect(comprobante.body.data).toBeNull();
  });
});

describe('H15-07 — un reintento reutiliza el XML persistido aunque el cronograma cambie después (protección explícita de H13-B)', () => {
  it('el XML del comprobante reenviado sigue siendo el original, no uno reconstruido con el cronograma modificado', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'no_transmitido', mensaje: 'Falla de envío controlada (H15-07)' });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 1,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    const primerIntento = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    expect(primerIntento.body.data.estado).toBe('error_envio');
    const comprobanteId = primerIntento.body.data.id as string;
    const xmlOriginal = primerIntento.body.data.xmlFirmado as string;
    expect(xmlOriginal).toContain('<cbc:PaymentDueDate>2026-10-15</cbc:PaymentDueDate>');

    // El cronograma pactado cambia DESPUÉS del intento fallido — H13-B exige que un reintento
    // jamás vuelva a leer esto ni a reconstruir el XML a partir de él.
    await cambiarVencimientoDeCuota(ventaId, 1, '2099-01-01');

    espiaOse?.mockRestore();
    mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const reintento = await api
      .post(`/api/facturacion/comprobantes/${comprobanteId}/reintentar`, sesion)
      .expect(200);
    expect(reintento.body.data.estado).toBe('aceptado');
    expect(reintento.body.data.xmlFirmado).toBe(xmlOriginal);
    expect(reintento.body.data.xmlFirmado).toContain('<cbc:PaymentDueDate>2026-10-15</cbc:PaymentDueDate>');
    expect(reintento.body.data.xmlFirmado).not.toContain('2099-01-01');
  });
});

/** Cambia el monto pactado de una cuota ya persistida — mismo mecanismo de bypass que
 * `cambiarVencimientoDeCuota`, para simular un cronograma desigual (40/60) sin depender de que
 * `generarCuotas` reparta en partes iguales. */
async function cambiarMontoDeCuota(ventaId: string, numero: number, nuevoMonto: number): Promise<void> {
  await conBypassRls((qr) =>
    qr.query(`UPDATE "cuotas_venta" SET "monto" = $1 WHERE "venta_id" = $2 AND "numero" = $3`, [
      nuevoMonto,
      ventaId,
      numero,
    ]),
  );
}

/**
 * H15C-01 — RED: el `Amount` del `PaymentTerms` general (`FormaPago/Credito`, dato 171) debe
 * reflejar el monto neto REALMENTE pendiente al momento de la primera emisión, no simplemente
 * `sum(CuotaVenta.monto)` (el cronograma originalmente pactado). Si antes de emitir ya hubo una
 * cobranza parcial (`PagoVenta` vigente), el `Amount` general debe descontarla — sin que eso
 * toque en absoluto el cronograma pactado (`CuotaNNN`, datos 172/173), que sigue viniendo
 * exclusivamente de `CuotaVenta` (H15-RED-05 ya lo protege).
 *
 * HOY `construirPaymentTerms` calcula el `Amount` general sumando `cuotas` sin considerar
 * `PagoVenta`, así que los casos B, C y D de abajo fallan contra la implementación actual
 * (100.00 en vez de 70.00) — ese es el RED real de esta corrección.
 */
describe('H15C-01 — el Amount general de PaymentTerms/Credito refleja el saldo neto pendiente en la primera emisión', () => {
  it('A) crédito sin pagos previos — Amount general = total pactado (100.00)', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 1,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    const bloques = bloquesPaymentTerms(emitida.body.data.xmlFirmado as string);
    expect(bloques[0]).toMatch(/<cbc:Amount currencyID="PEN">100\.00<\/cbc:Amount>/);
  });

  it('B) crédito con un pago previo de 30 — Amount general = 70.00 (saldo neto); el cronograma pactado no cambia', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 1,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    await api
      .post(`/api/cuentas-por-cobrar/${ventaId}/pagos`, sesion, {
        fechaPago: '2026-09-20',
        monto: 30,
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);

    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    const bloques = bloquesPaymentTerms(emitida.body.data.xmlFirmado as string);

    expect(bloques[0]).toContain('<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>');
    expect(bloques[0]).toMatch(/<cbc:Amount currencyID="PEN">70\.00<\/cbc:Amount>/);

    // El cronograma pactado (CuotaNNN) sigue siendo el total original pactado, no el saldo:
    // PagoVenta nunca se convierte en CuotaVenta.
    const cuota1 = bloques[1];
    expect(cuota1).toContain('<cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>');
    expect(cuota1).toMatch(/<cbc:Amount currencyID="PEN">100\.00<\/cbc:Amount>/);
  });

  it('C) pago previo anulado antes de emitir — Amount general vuelve a reflejar el total pactado (100.00)', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 1,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    const cobrado = await api
      .post(`/api/cuentas-por-cobrar/${ventaId}/pagos`, sesion, {
        fechaPago: '2026-09-20',
        monto: 30,
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const pagoId = (cobrado.body.data.pagos as Array<{ id: string }>)[0].id;

    await api
      .delete(`/api/pagos-venta/${pagoId}`, sesion)
      .send({ motivo: 'Registrado por error (H15C-01)' })
      .expect(200);

    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    const bloques = bloquesPaymentTerms(emitida.body.data.xmlFirmado as string);

    expect(bloques[0]).toContain('<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>');
    expect(bloques[0]).toMatch(/<cbc:Amount currencyID="PEN">100\.00<\/cbc:Amount>/);
  });

  it('D) varias cuotas (40/60) con un pago previo de 30 — Amount general = 70.00, pero CuotaNNN sigue 40.00/60.00', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 2,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    // El reparto por defecto de `generarCuotas` es 50/50; se fuerza acá un cronograma desigual
    // (40/60) para demostrar que el Amount general no redistribuye cuotas, solo descuenta del
    // total pactado lo ya cobrado.
    await cambiarMontoDeCuota(ventaId, 1, 40);
    await cambiarMontoDeCuota(ventaId, 2, 60);

    await api
      .post(`/api/cuentas-por-cobrar/${ventaId}/pagos`, sesion, {
        fechaPago: '2026-09-20',
        monto: 30,
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);

    const emitida = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    const bloques = bloquesPaymentTerms(emitida.body.data.xmlFirmado as string);

    expect(bloques).toHaveLength(3); // general + Cuota001 + Cuota002
    expect(bloques[0]).toContain('<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>');
    expect(bloques[0]).toMatch(/<cbc:Amount currencyID="PEN">70\.00<\/cbc:Amount>/);

    expect(bloques[1]).toContain('<cbc:PaymentMeansID>Cuota001</cbc:PaymentMeansID>');
    expect(bloques[1]).toMatch(/<cbc:Amount currencyID="PEN">40\.00<\/cbc:Amount>/);
    expect(bloques[2]).toContain('<cbc:PaymentMeansID>Cuota002</cbc:PaymentMeansID>');
    expect(bloques[2]).toMatch(/<cbc:Amount currencyID="PEN">60\.00<\/cbc:Amount>/);
  });
});

/** Simula un `xmlFirmado` histórico (anterior a H15): el flujo real de este código jamás
 * produce un XML de crédito sin `PaymentTerms`, así que se fuerza con el mismo bypass RLS que
 * ya usan H15-06/07. */
async function quitarPaymentTermsDeXml(comprobanteId: string, xmlFirmado: string): Promise<string> {
  const xmlHistorico = xmlFirmado.replace(/<cac:PaymentTerms>[\s\S]*?<\/cac:PaymentTerms>\n?/g, '');
  await conBypassRls((qr) =>
    qr.query(`UPDATE "comprobantes_electronicos" SET "xml_firmado" = $1 WHERE "id" = $2`, [
      xmlHistorico,
      comprobanteId,
    ]),
  );
  return xmlHistorico;
}

/**
 * H15C-03/H15D-02 — antes de H15, `construirXmlFactura` nunca emitía `<cac:PaymentTerms>` (no
 * existe en ningún commit previo a este trabajo): un `xmlFirmado`, de crédito O de contado, sin
 * la representación H15 esperada de la forma de pago (RS 193-2020/SUNAT, Anexo IV) es, con
 * certeza, anterior a H15. H13-B prohíbe reconstruirlo dentro de `/reintentar` (reutiliza el XML
 * firmado tal cual, sin volver a firmar), así que la única vía segura es bloquear y exigir
 * reconciliación fiscal manual explícita, en vez de reenviar a SUNAT un documento que sabemos
 * incompleto. `xmlTienePaymentTermsValido` (factura.builder.ts) es la comprobación semántica
 * real (bloques `PaymentTerms` esperados, no una simple búsqueda de texto) — H15-HIST-01/02
 * cubren el bloqueo (crédito y contado), H15-HIST-03/04 confirman que un reintento post-H15
 * legítimo sigue funcionando exactamente igual que antes (H13-B intacto).
 */
describe('H15-HIST — un ERROR_ENVIO histórico sin la representación H15 de forma de pago no se reintenta automáticamente', () => {
  it('H15-HIST-01: CREDITO histórico sin PaymentTerms → 409, sin tocar estado/intentos/XML/hash/nombre, sin llamar al OSE', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'no_transmitido', mensaje: 'Falla de envío controlada (H15-HIST-01)' });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 1,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    const primerIntento = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    expect(primerIntento.body.data.estado).toBe('error_envio');
    const comprobanteId = primerIntento.body.data.id as string;
    const xmlModerno = primerIntento.body.data.xmlFirmado as string;
    expect(xmlModerno).toContain('<cac:PaymentTerms>');

    const xmlHistorico = await quitarPaymentTermsDeXml(comprobanteId, xmlModerno);
    expect(xmlHistorico).not.toContain('<cac:PaymentTerms>');

    const antes = await api.get(`/api/facturacion/ventas/${ventaId}`, sesion).expect(200);
    expect(antes.body.data.estado).toBe('error_envio');
    expect(antes.body.data.intentos).toBe(1);

    espiaOse?.mockRestore();
    const espiaReintento = mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const reintento = await api.post(
      `/api/facturacion/comprobantes/${comprobanteId}/reintentar`,
      sesion,
    );
    expect(reintento.status).toBe(409);
    // Bloqueado antes de tocar al OSE: no hay un segundo intento silencioso con un documento
    // que sabemos incompleto.
    expect(espiaReintento).not.toHaveBeenCalled();

    // Invariante: el comprobante queda EXACTAMENTE como estaba (H15D-02 no debe incrementar
    // `intentos` ni cambiar `estado` a `enviando` antes del guard).
    const despues = await api.get(`/api/facturacion/ventas/${ventaId}`, sesion).expect(200);
    expect(despues.body.data.estado).toBe('error_envio');
    expect(despues.body.data.intentos).toBe(antes.body.data.intentos);
    expect(despues.body.data.xmlFirmado).toBe(xmlHistorico);
    expect(despues.body.data.hashFirma).toBe(antes.body.data.hashFirma);
    expect(despues.body.data.nombreArchivo).toBe(antes.body.data.nombreArchivo);
  });

  it('H15-HIST-02: CONTADO histórico sin PaymentTerms → 409, sin tocar estado/intentos/XML/hash/nombre, sin llamar al OSE', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'no_transmitido', mensaje: 'Falla de envío controlada (H15-HIST-02)' });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    const primerIntento = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    expect(primerIntento.body.data.estado).toBe('error_envio');
    const comprobanteId = primerIntento.body.data.id as string;
    const xmlModerno = primerIntento.body.data.xmlFirmado as string;
    expect(xmlModerno).toContain('<cac:PaymentTerms>');

    const xmlHistorico = await quitarPaymentTermsDeXml(comprobanteId, xmlModerno);
    expect(xmlHistorico).not.toContain('<cac:PaymentTerms>');

    const antes = await api.get(`/api/facturacion/ventas/${ventaId}`, sesion).expect(200);
    expect(antes.body.data.estado).toBe('error_envio');
    expect(antes.body.data.intentos).toBe(1);

    espiaOse?.mockRestore();
    const espiaReintento = mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const reintento = await api.post(
      `/api/facturacion/comprobantes/${comprobanteId}/reintentar`,
      sesion,
    );
    expect(reintento.status).toBe(409);
    expect(espiaReintento).not.toHaveBeenCalled();

    const despues = await api.get(`/api/facturacion/ventas/${ventaId}`, sesion).expect(200);
    expect(despues.body.data.estado).toBe('error_envio');
    expect(despues.body.data.intentos).toBe(antes.body.data.intentos);
    expect(despues.body.data.xmlFirmado).toBe(xmlHistorico);
    expect(despues.body.data.hashFirma).toBe(antes.body.data.hashFirma);
    expect(despues.body.data.nombreArchivo).toBe(antes.body.data.nombreArchivo);
  });

  it('H15-HIST-03: CREDITO post-H15 válido → reintento permitido, reutiliza xmlFirmado/hashFirma/nombreArchivo exactos', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'no_transmitido', mensaje: 'Falla de envío controlada (H15-HIST-03)' });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 1,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    const primerIntento = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    expect(primerIntento.body.data.estado).toBe('error_envio');
    const comprobanteId = primerIntento.body.data.id as string;

    espiaOse?.mockRestore();
    mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const reintento = await api
      .post(`/api/facturacion/comprobantes/${comprobanteId}/reintentar`, sesion)
      .expect(200);
    expect(reintento.body.data.estado).toBe('aceptado');
    expect(reintento.body.data.intentos).toBe(2);
    // H13-B: mismo XML/hash/nombre — nunca reconstruidos ni refirmados.
    expect(reintento.body.data.xmlFirmado).toBe(primerIntento.body.data.xmlFirmado);
    expect(reintento.body.data.hashFirma).toBe(primerIntento.body.data.hashFirma);
    expect(reintento.body.data.nombreArchivo).toBe(primerIntento.body.data.nombreArchivo);
  });

  it('H15-HIST-04: CONTADO post-H15 válido → reintento permitido, reutiliza xmlFirmado/hashFirma/nombreArchivo exactos', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'no_transmitido', mensaje: 'Falla de envío controlada (H15-HIST-04)' });

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'contado',
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    const primerIntento = await api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).expect(200);
    expect(primerIntento.body.data.estado).toBe('error_envio');
    const comprobanteId = primerIntento.body.data.id as string;

    espiaOse?.mockRestore();
    mockearRespuestaOse({
      tipo: 'definitiva',
      codigoRespuesta: '0',
      mensaje: 'Aceptado',
      cdrXml: '<ok/>',
    });

    const reintento = await api
      .post(`/api/facturacion/comprobantes/${comprobanteId}/reintentar`, sesion)
      .expect(200);
    expect(reintento.body.data.estado).toBe('aceptado');
    expect(reintento.body.data.intentos).toBe(2);
    expect(reintento.body.data.xmlFirmado).toBe(primerIntento.body.data.xmlFirmado);
    expect(reintento.body.data.hashFirma).toBe(primerIntento.body.data.hashFirma);
    expect(reintento.body.data.nombreArchivo).toBe(primerIntento.body.data.nombreArchivo);
  });
});

/**
 * H15D-01 — RED/GREEN concurrente: `prepararEmisionInicial` bloquea `Venta` con
 * `pessimistic_write` y, mientras la mantiene bloqueada, lee `PagoVenta` para calcular el
 * `Amount` general de crédito (H15C-01). Antes de esta corrección, `anularPago` no bloqueaba
 * `Venta` en absoluto: podía modificar ese mismo `PagoVenta` — y confirmar su propia transacción
 * — mientras la emisión seguía con el lock de `Venta` abierto, sin haber terminado de preparar
 * ni confirmado nada todavía. El resultado observable era el descrito en el enunciado: el XML
 * quedaba firmado con `Amount=70` (el saldo leído ANTES de la anulación) mientras el saldo real,
 * apenas un instante después, ya era 100.
 *
 * El punto de la barrera es deliberado: se espía `cobranzaService.calcularMontoPendienteCredito`
 * (mismo patrón de `vi.spyOn` sobre un named export ya usado en `facturacion-h13b1.test.ts` con
 * `facturaBuilder`/`firmador`) para pausar la preparación de la emisión JUSTO DESPUÉS de haber
 * leído `PagoVenta` (montoPendiente ya calculado en 70, con el lock de `Venta` todavía activo en
 * Postgres) y ANTES de `confirmarTransaccionDeLaPeticion()` — a diferencia de los tests de
 * concurrencia existentes en `facturacion-h13b.test.ts` (T-B08/T-B11), que pausan dentro de
 * `enviarComprobante`, es decir DESPUÉS del commit anticipado, cuando el lock de `Venta` ya se
 * liberó. Acá se necesita justo lo contrario: el lock real de Postgres todavía sostenido durante
 * la pausa es lo que se está poniendo a prueba.
 *
 * La ventana de espera NO es el mecanismo de corrección (ese es el lock real de Postgres más la
 * barrera de arriba, que fuerzan el orden con certeza) — es solo la forma de OBSERVAR desde este
 * proceso si la promesa de la anulación ya se resolvió o sigue pendiente. Un umbral fijo pequeño
 * (ej. 500ms) dio un falso GREEN incluso contra la implementación SIN corregir: instrumentado con
 * `pg_stat_activity`, se confirmó que el bloqueo observado no era el lock de `Venta`, sino
 * `suscripcion.service.ts: registrarUso` — el contador de uso por empresa/día que
 * `auth.middleware.ts` ejecuta en CADA petición autenticada, como parte de la MISMA transacción
 * de la petición, con un `INSERT ... ON CONFLICT (empresa_id, fecha) DO UPDATE` (documentado ahí
 * mismo: "dos peticiones simultáneas de la misma empresa perderían una de las dos cuentas"). Como
 * las dos peticiones de este test son de la MISMA empresa el MISMO día, esa fila ya serializa
 * cualquier par de peticiones concurrentes entre sí — antes incluso de llegar a `Venta` — y lo
 * haría igual con o sin la corrección de H15D-01, dando un falso positivo. Se neutraliza con
 * `vi.spyOn(suscripcionService, 'registrarUso')` (no-op) para que la única serialización posible
 * en este test sea la que realmente se está poniendo a prueba.
 */
describe('H15D-01 — concurrencia: preparar la primera emisión y anular un pago previo se serializan por Venta', () => {
  it('la anulación no puede modificar el pago mientras la emisión mantiene el lock de Venta; al liberarse, se aplica después', async () => {
    const { sesion, catalogos, productoId } = await empresaConFacturacionConfigurada(100);
    mockearRespuestaOse({ tipo: 'definitiva', codigoRespuesta: '0', mensaje: 'Aceptado', cdrXml: '<ok/>' });
    // Ver el docblock de arriba: sin esto, el contador de uso por empresa/día ya serializa
    // cualquier par de peticiones concurrentes de la misma empresa, sin importar la corrección.
    espiaRegistrarUso = vi.spyOn(suscripcionService, 'registrarUso').mockResolvedValue(undefined);

    const venta = await api
      .post('/api/ventas', sesion, {
        detalles: [{ productoId, cantidad: 1 }],
        tipoComprobanteId: catalogos.boletaId,
        formaPago: 'credito',
        fechaPrimerVencimiento: '2026-10-15',
        numeroCuotas: 1,
      })
      .expect(201);
    const ventaId = venta.body.data.id as string;

    const cobrado = await api
      .post(`/api/cuentas-por-cobrar/${ventaId}/pagos`, sesion, {
        fechaPago: '2026-09-20',
        monto: 30,
        medioPagoId: catalogos.efectivoId,
      })
      .expect(201);
    const pagoId = (cobrado.body.data.pagos as Array<{ id: string }>)[0].id;

    const barrera = crearBarrera();
    const calcularOriginal = cobranzaService.calcularMontoPendienteCredito;
    espiaMontoPendiente = vi
      .spyOn(cobranzaService, 'calcularMontoPendienteCredito')
      .mockImplementation(async (ventaIdArg: string, totalPactado: number) => {
        // La lectura real (pagado=30 → 70 pendiente) ocurre AQUÍ, con el lock de Venta ya
        // activo — recién después se avisa y se pausa, para que la anulación concurrente solo
        // pueda intentar actuar cuando ese valor ya quedó fijado en esta preparación.
        const resultado = await calcularOriginal(ventaIdArg, totalPactado);
        barrera.marcarAlcanzado();
        await barrera.promesaLiberacion;
        return resultado;
      });

    // Línea base AUTOCALIBRADA: una petición autenticada comparable (GET, sin contención) en
    // esta máquina/entorno de pruebas puede tardar bastante por sí sola (overhead de
    // Express/supertest/Postgres local, no de ningún lock) — un umbral fijo pequeño da falsos
    // positivos. Se mide una petición de referencia y la ventana de observación exige un margen
    // amplio sobre ella (mínimo 1000ms, o 8× la línea base si esta ya es alta).
    const inicioLineaBase = Date.now();
    await api.get(`/api/cuentas-por-cobrar/${ventaId}`, sesion).expect(200);
    const lineaBaseMs = Date.now() - inicioLineaBase;
    const ventanaObservacionMs = Math.max(1000, lineaBaseMs * 8);

    const promesaEmitir = api.post(`/api/facturacion/ventas/${ventaId}/emitir`, sesion).then((r) => r);
    await barrera.promesaAlcanzado;

    let anulacionTermino = false;
    const promesaAnular = api
      .delete(`/api/pagos-venta/${pagoId}`, sesion)
      .send({ motivo: 'Carrera H15D-01' })
      .then((r) => {
        anulacionTermino = true;
        return r;
      });

    await new Promise((resolve) => setTimeout(resolve, ventanaObservacionMs));
    // Propiedad GREEN: la anulación NO puede completarse mientras la emisión sigue sosteniendo
    // el lock de Venta — debe seguir pendiente, muy por encima de lo que tardaría sin contención.
    expect(anulacionTermino).toBe(false);

    barrera.liberar();
    const [respuestaEmitir, respuestaAnular] = await Promise.all([promesaEmitir, promesaAnular]);

    expect(respuestaEmitir.status).toBe(200);
    expect(respuestaAnular.status).toBe(200);

    // Orden serial equivalente: la emisión ganó el lock primero, así que su XML refleja
    // legítimamente el saldo de ESE instante (70) — la anulación, que tuvo que esperar, se
    // aplicó recién después.
    const bloques = bloquesPaymentTerms(respuestaEmitir.body.data.xmlFirmado as string);
    expect(bloques[0]).toMatch(/<cbc:Amount currencyID="PEN">70\.00<\/cbc:Amount>/);

    // El estado real, después de que ambas operaciones terminaron en ese orden, es consistente:
    // el pago ya está anulado y el saldo actual (no el del XML ya firmado) es 100.
    const cobranzaFinal = await api.get(`/api/cuentas-por-cobrar/${ventaId}`, sesion).expect(200);
    expect(cobranzaFinal.body.data.saldo).toBe(100);
    expect(cobranzaFinal.body.data.pagos[0].anulado).toBe(true);
  });
});
