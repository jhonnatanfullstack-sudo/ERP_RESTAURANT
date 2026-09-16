import {
  cantidad,
  escaparXml,
  monto,
} from '../../facturacion/ubl/xml.util';
import type { Empresa } from '../../empresa/empresa.entity';
import type { NotaVenta } from '../nota-venta.entity';
import type { DetalleNotaVenta } from '../detalle-nota-venta.entity';

/** Igual al de `facturacion/ubl/factura.builder.ts` — se repite acá (y no se importa de allá)
 * porque esa constante no está exportada: es un detalle interno de armar una línea, y las
 * notas arman las suyas con nombres de elemento distintos (`CreditNoteLine`/`DebitNoteLine`).
 * Ver `docs/decisiones-tecnicas.md` sobre por qué no se unificó en un solo builder genérico. */
const TRIBUTOS = {
  gravado: { id: '1000', nombre: 'IGV', codigo: 'VAT' },
  exonerado: { id: '9997', nombre: 'EXO', codigo: 'VAT' },
  inafecto: { id: '9996', nombre: 'INA', codigo: 'FRE' },
} as const;

const CODIGO_AFECTACION_GRAVADO = '10';
const CODIGO_AFECTACION_EXONERADO = '20';

export const MONEDA = 'PEN';

function tributoDe(codigoAfectacion: string) {
  if (codigoAfectacion === CODIGO_AFECTACION_GRAVADO) return TRIBUTOS.gravado;
  if (codigoAfectacion === CODIGO_AFECTACION_EXONERADO) return TRIBUTOS.exonerado;
  return TRIBUTOS.inafecto;
}

/** Nombre normativo del archivo y del ZIP: `RUC-TIPO-SERIE-CORRELATIVO`, igual que en
 * `facturacion/ubl/factura.builder.ts`. */
export function nombreArchivo(empresa: Empresa, nota: NotaVenta): string {
  return `${empresa.ruc}-${nota.tipoComprobante.codigo}-${nota.serie}-${nota.numero}`;
}

/** Correlativo a 8 dígitos, como se muestra en el documento: `FC01-00000012`. */
export function numeroFormateado(nota: NotaVenta): string {
  return `${nota.serie}-${String(nota.numero).padStart(8, '0')}`;
}

/**
 * Una línea de `CreditNoteLine`/`DebitNoteLine` — misma estructura de impuestos que
 * `InvoiceLine`, con el nombre del elemento y de la cantidad parametrizados porque UBL usa uno
 * distinto para cada tipo de documento.
 */
export function construirLineaAjuste(
  detalle: DetalleNotaVenta,
  indice: number,
  tasaIgv: number,
  tagLinea: 'CreditNoteLine' | 'DebitNoteLine',
  tagCantidad: 'CreditedQuantity' | 'DebitedQuantity',
  unidadCodigo: string,
): string {
  const tributo = tributoDe(detalle.tipoAfectacionIgv.codigo);
  const valorUnitario = detalle.valorVenta / detalle.cantidad;
  const esGravado = detalle.tipoAfectacionIgv.codigo === CODIGO_AFECTACION_GRAVADO;

  return `    <cac:${tagLinea}>
      <cbc:ID>${indice + 1}</cbc:ID>
      <cbc:${tagCantidad} unitCode="${escaparXml(unidadCodigo)}">${cantidad(detalle.cantidad)}</cbc:${tagCantidad}>
      <cbc:LineExtensionAmount currencyID="${MONEDA}">${monto(detalle.valorVenta)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
        <cac:AlternativeConditionPrice>
          <cbc:PriceAmount currencyID="${MONEDA}">${monto(detalle.precioUnitario)}</cbc:PriceAmount>
          <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
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
    </cac:${tagLinea}>`;
}

/** Agrupa los importes por tributo: SUNAT exige un `TaxSubtotal` por cada uno presente. */
export function construirTotalesImpuestos(detalles: DetalleNotaVenta[]): string {
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

/** Datos del receptor — igual criterio que `factura.builder.ts: construirCliente`. */
export function construirCliente(nota: NotaVenta): string {
  const cliente = nota.venta.cliente;
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

/** Bloque `AccountingSupplierParty` — igual que en `factura.builder.ts`. */
export function construirProveedor(empresa: Empresa): string {
  return `  <cac:AccountingSupplierParty>
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
  </cac:AccountingSupplierParty>`;
}

/** Bloque `Signature` — igual que en `factura.builder.ts`; el hueco donde se inserta la firma
 * digital lo deja `ext:UBLExtensions` en cada builder raíz. */
export function construirFirma(empresa: Empresa): string {
  return `  <cac:Signature>
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
  </cac:Signature>`;
}
