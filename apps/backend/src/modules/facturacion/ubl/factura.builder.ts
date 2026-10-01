import { cantidad, escaparXml, fechaEmision, horaEmision, monto, montoEnLetras } from './xml.util';
import { FormaPago } from '../../ventas/venta.entity';
import type { Venta } from '../../ventas/venta.entity';
import type { DetalleVenta } from '../../ventas/detalle-venta.entity';

/**
 * Catálogo SUNAT N° 05 (códigos de tributo). El código de afectación del producto (catálogo
 * N° 07: 10/20/30) determina bajo qué tributo se declara la línea.
 */
const TRIBUTOS = {
  gravado: { id: '1000', nombre: 'IGV', codigo: 'VAT' },
  exonerado: { id: '9997', nombre: 'EXO', codigo: 'VAT' },
  inafecto: { id: '9996', nombre: 'INA', codigo: 'FRE' },
} as const;

const CODIGO_AFECTACION_GRAVADO = '10';
const CODIGO_AFECTACION_EXONERADO = '20';

/** Catálogo SUNAT N° 16: `01` = precio unitario incluyendo IGV. */
const PRECIO_UNITARIO_CON_IGV = '01';

/** Moneda: todo el sistema cobra en soles (ver `venta.service.ts`). */
const MONEDA = 'PEN';

function tributoDe(codigoAfectacion: string) {
  if (codigoAfectacion === CODIGO_AFECTACION_GRAVADO) return TRIBUTOS.gravado;
  if (codigoAfectacion === CODIGO_AFECTACION_EXONERADO) return TRIBUTOS.exonerado;
  return TRIBUTOS.inafecto;
}

/** Correlativo a 8 dígitos, como se muestra en el comprobante: `F001-00000123`. */
export function numeroFormateado(venta: Venta): string {
  return `${venta.serie}-${String(venta.numero).padStart(8, '0')}`;
}

/**
 * Nombre normativo del archivo y del ZIP: `RUC-TIPO-SERIE-CORRELATIVO`. Recibe el RUC ya
 * resuelto (H16: `DatosEmpresaFiscal.ruc`, no `Empresa` directamente) para que el nombre del
 * archivo use siempre el mismo RUC que declara el contenido del XML — nunca uno vivo y el otro
 * histórico.
 */
export function nombreArchivo(rucEmpresa: string, venta: Venta): string {
  return `${rucEmpresa}-${venta.tipoComprobante.codigo}-${venta.serie}-${venta.numero}`;
}

function construirLinea(detalle: DetalleVenta, indice: number, tasaIgv: number): string {
  const tributo = tributoDe(detalle.tipoAfectacionIgv.codigo);
  // Valor unitario sin IGV: SUNAT pide el valor de venta unitario en `Price`, mientras que el
  // precio con IGV va como referencia en `PricingReference`.
  const valorUnitario = detalle.valorVenta / detalle.cantidad;
  const esGravado = detalle.tipoAfectacionIgv.codigo === CODIGO_AFECTACION_GRAVADO;

  return `    <cac:InvoiceLine>
      <cbc:ID>${indice + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${escaparXml(detalle.producto.unidadMedida.codigo)}">${cantidad(detalle.cantidad)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${MONEDA}">${monto(detalle.valorVenta)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="${MONEDA}">${monto(detalle.precioUnitario)}</cbc:PriceAmount>
          <cbc:PriceTypeCode>${PRECIO_UNITARIO_CON_IGV}</cbc:PriceTypeCode>
        </cac:AlternativeConditionPrice>
      </cac:PricingReference>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${MONEDA}">${monto(detalle.igv)}</cbc:TaxAmount>
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${MONEDA}">${monto(detalle.valorVenta)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${MONEDA}">${monto(detalle.igv)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:Percent>${(tasaIgv * 100).toFixed(2)}</cbc:Percent>
            <cbc:TaxExemptionReasonCode>${detalle.tipoAfectacionIgv.codigo}</cbc:TaxExemptionReasonCode>
            <cac:TaxScheme>
              <cbc:ID>${tributo.id}</cbc:ID>
              <cbc:Name>${tributo.nombre}</cbc:Name>
              <cbc:TaxTypeCode>${tributo.codigo}</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Description><![CDATA[${detalle.descripcionProducto}]]></cbc:Description>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${MONEDA}">${esGravado ? monto(valorUnitario) : monto(detalle.precioUnitario)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
}

/** Agrupa los importes por tributo: SUNAT exige un `TaxSubtotal` por cada uno presente. */
function construirTotalesImpuestos(detalles: DetalleVenta[]): string {
  const porTributo = new Map<string, { base: number; impuesto: number; afectacion: string }>();

  for (const detalle of detalles) {
    const tributo = tributoDe(detalle.tipoAfectacionIgv.codigo);
    const actual = porTributo.get(tributo.id) ?? {
      base: 0,
      impuesto: 0,
      afectacion: detalle.tipoAfectacionIgv.codigo,
    };
    actual.base += detalle.valorVenta;
    actual.impuesto += detalle.igv;
    porTributo.set(tributo.id, actual);
  }

  return Array.from(porTributo, ([idTributo, valores]) => {
    const tributo =
      Object.values(TRIBUTOS).find((candidato) => candidato.id === idTributo) ?? TRIBUTOS.gravado;
    return `      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${MONEDA}">${monto(valores.base)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${MONEDA}">${monto(valores.impuesto)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:TaxExemptionReasonCode>${valores.afectacion}</cbc:TaxExemptionReasonCode>
          <cac:TaxScheme>
            <cbc:ID>${tributo.id}</cbc:ID>
            <cbc:Name>${tributo.nombre}</cbc:Name>
            <cbc:TaxTypeCode>${tributo.codigo}</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>`;
  }).join('\n');
}

/**
 * Datos fiscales efectivos del emisor (H16) — ya resueltos por `facturacion.service.ts` antes
 * de llamar a este builder: snapshot congelado al momento de la venta (`snapshotFiscalVersion
 * = 1`) o, para una venta legacy sin ese contrato, los datos vivos de `Empresa` como
 * compatibilidad best-effort. El builder nunca decide cuál de las dos fuentes usar — solo
 * serializa lo que recibe.
 */
export interface DatosEmpresaFiscal {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  ubigeo: string | null;
  direccionFiscal: string | null;
}

/** Mismo criterio que `DatosEmpresaFiscal`, para el receptor. `null` cuando la venta no tiene
 * cliente identificado (boleta a "CLIENTE VARIOS") — no es un caso de error. */
export type DatosClienteFiscal = {
  tipoDocumentoCodigo: string | null;
  numeroDocumento: string | null;
  razonSocial: string | null;
  nombres: string | null;
  apellidos: string | null;
} | null;

/** Datos del receptor. Una boleta a consumidor final puede ir sin cliente identificado, y en
 * ese caso SUNAT acepta tipo de documento `0` con número `-`. */
function construirCliente(clienteFiscal: DatosClienteFiscal): string {
  const tipoDoc = clienteFiscal?.tipoDocumentoCodigo ?? '0';
  const numeroDoc = clienteFiscal?.numeroDocumento ?? '-';
  const nombre =
    clienteFiscal?.razonSocial ??
    `${clienteFiscal?.nombres ?? ''} ${clienteFiscal?.apellidos ?? ''}`.trim() ??
    'CLIENTE VARIOS';

  return `  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${tipoDoc}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${escaparXml(numeroDoc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${nombre || 'CLIENTE VARIOS'}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

/**
 * Cronograma pactado de una venta al crédito, tal como lo exige el comprobante (RS
 * 193-2020/SUNAT). Tipo liviano y no la `Entity` `CuotaVenta` a propósito: este builder no debe
 * acoplarse a TypeORM — quien llama (`facturacion.service.ts`) es quien decide de dónde sale
 * cada cuota, y siempre debe ser del cronograma pactado, nunca de `PagoVenta` (cobranza real).
 */
export interface CuotaComprobante {
  /** Correlativo desde 1 — determina el sufijo `CuotaNNN`, no el orden de aparición en el
   * arreglo: este builder ordena defensivamente por este campo antes de serializar. */
  numero: number;
  monto: number;
  /** `YYYY-MM-DD`, ya como string (mismo formato que devuelve la columna `date` de Postgres) —
   * se serializa tal cual, sin pasar por ningún `Date`, para no arriesgar un desplazamiento de
   * zona horaria. */
  fechaVencimiento: string;
}

interface OpcionesFactura {
  venta: Venta;
  /** Datos fiscales efectivos del emisor (H16) — resueltos por `facturacion.service.ts`
   * (snapshot congelado o, para legacy, la `Empresa` vigente), nunca la entidad `Empresa`
   * directamente: este builder no decide snapshot-vs-vivo. */
  empresaFiscal: DatosEmpresaFiscal;
  /** Datos fiscales efectivos del receptor (H16) — mismo criterio que `empresaFiscal`. */
  clienteFiscal: DatosClienteFiscal;
  /** Tasa efectiva aplicada a la venta (0.18 general, 0.105 régimen MYPE de restaurantes).
   * Se pasa desde afuera porque depende de la empresa y ya la resolvió `venta.service`. */
  tasaIgv: number;
  /** Cronograma pactado (H15, RS 193-2020/SUNAT, Anexo IV, datos 171-173) — solo se serializa
   * si `venta.formaPago === FormaPago.CREDITO`; se ignora por completo al contado. Quien llama
   * es responsable de garantizar que una venta al crédito nunca llegue aquí con este arreglo
   * vacío (`facturacion.service.ts` lo valida antes de construir el XML). */
  cuotas: CuotaComprobante[];
  /** Monto neto REALMENTE pendiente de cobro al momento de la primera emisión (H15C-01) — el
   * `Amount` del bloque general `FormaPago/Credito` (dato 171). Puede ser menor que
   * `sum(cuotas)` cuando ya hubo cobranza (`PagoVenta`) registrada antes de emitir; nunca
   * modifica el cronograma (`CuotaNNN`, datos 172/173), que sigue viniendo exclusivamente de
   * `cuotas`. Si se omite, se asume el total pactado sin cobros previos (mismo comportamiento
   * que antes de H15C-01) — útil para fixtures aisladas de este builder sin contexto de
   * cobranza; `facturacion.service.ts` SIEMPRE lo calcula y lo pasa explícitamente en
   * producción (`cobranza.service.ts: calcularMontoPendienteCredito`), el builder nunca
   * consulta la base de datos. */
  montoPendienteCredito?: number;
}

/**
 * `cac:PaymentTerms` (H15, RS 193-2020/SUNAT, Anexo IV, Anexo N.° 9-A "Estándar UBL 2.1", datos
 * 170-173). Al contado, un único bloque sin monto ni vencimiento. Al crédito, un bloque general
 * con el monto neto REALMENTE pendiente (H15C-01: `montoPendienteCredito`, nunca simplemente
 * `sum(cuotas)` si ya hubo cobranza previa) más un bloque por cada cuota del cronograma
 * **pactado** (`cuotas`, siempre el total original, jamás ajustado por lo ya cobrado), ordenados
 * por `numero` — el orden de `cuotas` en el arreglo de entrada no es de confianza, se reordena
 * siempre de forma defensiva.
 */
function construirPaymentTerms(
  venta: Venta,
  cuotas: CuotaComprobante[],
  montoPendienteCredito: number | undefined,
): string {
  if (venta.formaPago !== FormaPago.CREDITO) {
    return `  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
  </cac:PaymentTerms>`;
  }

  const cuotasOrdenadas = [...cuotas].sort((a, b) => a.numero - b.numero);
  const totalPactado = cuotasOrdenadas.reduce((suma, c) => suma + c.monto, 0);
  const montoGeneral = montoPendienteCredito ?? totalPactado;

  const bloqueGeneral = `  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>
    <cbc:Amount currencyID="${MONEDA}">${monto(montoGeneral)}</cbc:Amount>
  </cac:PaymentTerms>`;

  const bloquesCuota = cuotasOrdenadas.map(
    (cuota) => `  <cac:PaymentTerms>
    <cbc:ID>FormaPago</cbc:ID>
    <cbc:PaymentMeansID>Cuota${String(cuota.numero).padStart(3, '0')}</cbc:PaymentMeansID>
    <cbc:Amount currencyID="${MONEDA}">${monto(cuota.monto)}</cbc:Amount>
    <cbc:PaymentDueDate>${escaparXml(cuota.fechaVencimiento)}</cbc:PaymentDueDate>
  </cac:PaymentTerms>`,
  );

  return [bloqueGeneral, ...bloquesCuota].join('\n');
}

interface BloquePaymentTerms {
  id: string | null;
  paymentMeansId: string | null;
  amount: string | null;
  paymentDueDate: string | null;
}

/** Extrae cada bloque `<cac:PaymentTerms>...</cac:PaymentTerms>` de un XML ya generado, en
 * orden, con sus campos hijos relevantes — la contraparte de lectura de `construirPaymentTerms`. */
function extraerBloquesPaymentTerms(xml: string): BloquePaymentTerms[] {
  const bloques = xml.match(/<cac:PaymentTerms>[\s\S]*?<\/cac:PaymentTerms>/g) ?? [];
  return bloques.map((bloque) => ({
    id: bloque.match(/<cbc:ID>([^<]*)<\/cbc:ID>/)?.[1] ?? null,
    paymentMeansId: bloque.match(/<cbc:PaymentMeansID>([^<]*)<\/cbc:PaymentMeansID>/)?.[1] ?? null,
    amount: bloque.match(/<cbc:Amount[^>]*>([^<]*)<\/cbc:Amount>/)?.[1] ?? null,
    paymentDueDate: bloque.match(/<cbc:PaymentDueDate>([^<]*)<\/cbc:PaymentDueDate>/)?.[1] ?? null,
  }));
}

/**
 * H15D-02 — verifica que un `xmlFirmado` ya persistido contenga la representación H15 esperada
 * de la forma de pago (RS 193-2020/SUNAT, Anexo IV, datos 170-173): para CONTADO, un bloque
 * `PaymentTerms` con `ID=FormaPago`/`PaymentMeansID=Contado`; para CREDITO, un bloque general
 * `ID=FormaPago`/`PaymentMeansID=Credito` MÁS al menos una cuota (`PaymentMeansID=CuotaNNN`) con
 * `Amount` y `PaymentDueDate`. Pensada para `facturacion.service.ts: prepararReintento`, que
 * necesita distinguir un `xmlFirmado` histórico (anterior a H15, sin ningún `PaymentTerms`) de
 * uno post-H15 válido, sin volver a construir ni parsear el documento completo.
 *
 * Es una comprobación textual conservadora (regex sobre los bloques `<cac:PaymentTerms>`), no
 * un parser XML/XSD completo: no valida namespaces, la posición del bloque dentro del documento,
 * ni rechaza contenido inesperado adicional en cada bloque. Ese límite es aceptable acá porque
 * el único XML que esta función necesita reconocer es el que genera `construirPaymentTerms` de
 * este mismo archivo — no un UBL 2.1 arbitrario de terceros. **Fail-closed**: cualquier
 * ambigüedad (bloques ausentes, campos faltantes, forma de pago no reconocida) hace que devuelva
 * `false`, nunca `true` por omisión.
 */
export function xmlTienePaymentTermsValido(xmlFirmado: string, formaPago: FormaPago): boolean {
  const bloques = extraerBloquesPaymentTerms(xmlFirmado);
  const esBloqueFormaPago = (bloque: BloquePaymentTerms, valorEsperado: string): boolean =>
    bloque.id === 'FormaPago' && bloque.paymentMeansId === valorEsperado;

  if (formaPago !== FormaPago.CREDITO) {
    return bloques.some((bloque) => esBloqueFormaPago(bloque, 'Contado'));
  }

  const tieneBloqueGeneral = bloques.some((bloque) => esBloqueFormaPago(bloque, 'Credito'));
  const tieneCuotaValida = bloques.some(
    (bloque) =>
      bloque.id === 'FormaPago' &&
      bloque.paymentMeansId !== null &&
      /^Cuota\d{3}$/.test(bloque.paymentMeansId) &&
      bloque.amount !== null &&
      bloque.paymentDueDate !== null,
  );
  return tieneBloqueGeneral && tieneCuotaValida;
}

/**
 * Genera el XML UBL 2.1 de una Factura (01) o Boleta (03) a partir de una `Venta` registrada.
 *
 * El bloque `ext:UBLExtensions` queda vacío a propósito: es el hueco donde la firma digital
 * se inserta después (ver `firma/firmador.ts`). SUNAT exige que exista aunque todavía no
 * tenga contenido, porque la firma es un nodo dentro de él.
 */
export function construirXmlFactura({
  venta,
  empresaFiscal,
  clienteFiscal,
  tasaIgv,
  cuotas,
  montoPendienteCredito,
}: OpcionesFactura): string {
  const emitidaEn = venta.creadoEn;
  const totalGravado = venta.subtotal;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${numeroFormateado(venta)}</cbc:ID>
  <cbc:IssueDate>${fechaEmision(emitidaEn)}</cbc:IssueDate>
  <cbc:IssueTime>${horaEmision(emitidaEn)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="${venta.tipoOperacion.codigo}" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${venta.tipoComprobante.codigo}</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000"><![CDATA[${montoEnLetras(venta.total)}]]></cbc:Note>
  <cbc:DocumentCurrencyCode>${MONEDA}</cbc:DocumentCurrencyCode>
  <cac:Signature>
    <cbc:ID>${escaparXml(empresaFiscal.ruc)}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${escaparXml(empresaFiscal.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${empresaFiscal.razonSocial}]]></cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SignatureSP</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${escaparXml(empresaFiscal.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${empresaFiscal.nombreComercial ?? empresaFiscal.razonSocial}]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${empresaFiscal.razonSocial}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID>${escaparXml(empresaFiscal.ubigeo ?? '')}</cbc:ID>
          <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
          <cac:AddressLine>
            <cbc:Line><![CDATA[${empresaFiscal.direccionFiscal ?? '-'}]]></cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
${construirCliente(clienteFiscal)}
${construirPaymentTerms(venta, cuotas, montoPendienteCredito)}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${MONEDA}">${monto(venta.igv)}</cbc:TaxAmount>
${construirTotalesImpuestos(venta.detalles)}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${MONEDA}">${monto(totalGravado)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${MONEDA}">${monto(venta.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${MONEDA}">${monto(venta.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${venta.detalles.map((detalle, indice) => construirLinea(detalle, indice, tasaIgv)).join('\n')}
</Invoice>`;
}
