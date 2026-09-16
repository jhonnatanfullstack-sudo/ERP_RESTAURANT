import { fechaEmision, horaEmision, montoEnLetras, monto, escaparXml } from '../../facturacion/ubl/xml.util';
import {
  MONEDA,
  construirCliente,
  construirFirma,
  construirLineaAjuste,
  construirProveedor,
  construirTotalesImpuestos,
  numeroFormateado,
} from './nota-comun';
import type { Empresa } from '../../empresa/empresa.entity';
import type { NotaVenta } from '../nota-venta.entity';

interface OpcionesNotaCredito {
  nota: NotaVenta;
  empresa: Empresa;
  tasaIgv: number;
}

/**
 * Genera el XML UBL 2.1 de una Nota de Crédito (07) que corrige la `Venta` referenciada en
 * `nota.venta` — anulación, devolución total, error de RUC, etc. (ver `nota.motivo`).
 *
 * `cac:DiscrepancyResponse` es el bloque que SUNAT exige para explicar el porqué (código de
 * motivo + sustento); `cac:BillingReference` apunta al comprobante original que se corrige. El
 * resto (proveedor, cliente, impuestos, líneas) es la misma estructura que una Factura/Boleta,
 * ver `facturacion/ubl/factura.builder.ts` — con los nombres de elemento que UBL exige para
 * este tipo de documento (`CreditNoteLine`/`CreditedQuantity`).
 */
export function construirXmlNotaCredito({ nota, empresa, tasaIgv }: OpcionesNotaCredito): string {
  const emitidaEn = nota.creadoEn;
  const venta = nota.venta;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
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
  <cbc:ID>${numeroFormateado(nota)}</cbc:ID>
  <cbc:IssueDate>${fechaEmision(emitidaEn)}</cbc:IssueDate>
  <cbc:IssueTime>${horaEmision(emitidaEn)}</cbc:IssueTime>
  <cbc:DiscrepancyResponse>
    <cbc:ReferenceID>${escaparXml(`${venta.serie}-${String(venta.numero).padStart(8, '0')}`)}</cbc:ReferenceID>
    <cbc:ResponseCode>${nota.motivo.codigo}</cbc:ResponseCode>
    <cbc:Description><![CDATA[${nota.motivo.nombre}${nota.descripcionSustento ? ` — ${nota.descripcionSustento}` : ''}]]></cbc:Description>
  </cbc:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escaparXml(`${venta.serie}-${String(venta.numero).padStart(8, '0')}`)}</cbc:ID>
      <cbc:DocumentTypeCode>${venta.tipoComprobante.codigo}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cbc:DocumentCurrencyCode>${MONEDA}</cbc:DocumentCurrencyCode>
${construirFirma(empresa)}
${construirProveedor(empresa)}
${construirCliente(nota)}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${MONEDA}">${monto(nota.igv)}</cbc:TaxAmount>
${construirTotalesImpuestos(nota.detalles)}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="${MONEDA}">${monto(nota.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cbc:Note languageLocaleID="1000"><![CDATA[${montoEnLetras(nota.total)}]]></cbc:Note>
${nota.detalles
  .map((detalle, indice) =>
    construirLineaAjuste(
      detalle,
      indice,
      tasaIgv,
      'CreditNoteLine',
      'CreditedQuantity',
      detalle.producto?.unidadMedida.codigo ?? 'NIU',
    ),
  )
  .join('\n')}
</CreditNote>`;
}
