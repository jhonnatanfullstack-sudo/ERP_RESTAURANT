import { cantidad, escaparXml, fechaEmision, horaEmision, monto, montoEnLetras } from './xml.util';
import type { Empresa } from '../../empresa/empresa.entity';
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

/** Nombre normativo del archivo y del ZIP: `RUC-TIPO-SERIE-CORRELATIVO`. */
export function nombreArchivo(empresa: Empresa, venta: Venta): string {
  return `${empresa.ruc}-${venta.tipoComprobante.codigo}-${venta.serie}-${venta.numero}`;
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

/** Datos del receptor. Una boleta a consumidor final puede ir sin cliente identificado, y en
 * ese caso SUNAT acepta tipo de documento `0` con número `-`. */
function construirCliente(venta: Venta): string {
  const cliente = venta.cliente;
  const tipoDoc = cliente?.tipoDocumentoIdentidad?.codigo ?? '0';
  const numeroDoc = cliente?.numeroDocumento ?? '-';
  const nombre =
    cliente?.razonSocial ??
    `${cliente?.nombres ?? ''} ${cliente?.apellidos ?? ''}`.trim() ??
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

interface OpcionesFactura {
  venta: Venta;
  empresa: Empresa;
  /** Tasa efectiva aplicada a la venta (0.18 general, 0.105 régimen MYPE de restaurantes).
   * Se pasa desde afuera porque depende de la empresa y ya la resolvió `venta.service`. */
  tasaIgv: number;
}

/**
 * Genera el XML UBL 2.1 de una Factura (01) o Boleta (03) a partir de una `Venta` registrada.
 *
 * El bloque `ext:UBLExtensions` queda vacío a propósito: es el hueco donde la firma digital
 * se inserta después (ver `firma/firmador.ts`). SUNAT exige que exista aunque todavía no
 * tenga contenido, porque la firma es un nodo dentro de él.
 */
export function construirXmlFactura({ venta, empresa, tasaIgv }: OpcionesFactura): string {
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
    <cbc:ID>${escaparXml(empresa.ruc)}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${escaparXml(empresa.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${empresa.razonSocial}]]></cbc:Name>
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
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${escaparXml(empresa.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${empresa.nombreComercial ?? empresa.razonSocial}]]></cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${empresa.razonSocial}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID>${escaparXml(empresa.ubigeo ?? '')}</cbc:ID>
          <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
          <cac:AddressLine>
            <cbc:Line><![CDATA[${empresa.direccionFiscal ?? '-'}]]></cbc:Line>
          </cac:AddressLine>
          <cac:Country>
            <cbc:IdentificationCode>PE</cbc:IdentificationCode>
          </cac:Country>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
${construirCliente(venta)}
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
