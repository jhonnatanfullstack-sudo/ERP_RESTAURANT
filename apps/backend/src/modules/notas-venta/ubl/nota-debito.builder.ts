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

interface OpcionesNotaDebito {
  nota: NotaVenta;
  empresa: Empresa;
  tasaIgv: number;
}

/**
 * Genera el XML UBL 2.1 de una Nota de Débito (08): un cargo adicional sobre la `Venta`
 * referenciada (interés moratorio, penalidad, aumento de valor — ver `nota.motivo`), no una
 * corrección. Misma estructura que la Nota de Crédito (`nota-credito.builder.ts`) salvo el
 * total (`RequestedMonetaryTotal` en vez de `LegalMonetaryTotal`, como exige el esquema
 * DebitNote-2 de UBL) y el nombre de línea/cantidad (`DebitNoteLine`/`DebitedQuantity`).
 */
export function construirXmlNotaDebito({ nota, empresa, tasaIgv }: OpcionesNotaDebito): string {
  const emitidaEn = nota.creadoEn;
  const venta = nota.venta;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<DebitNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2"
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
  <cac:RequestedMonetaryTotal>
    <cbc:PayableAmount currencyID="${MONEDA}">${monto(nota.total)}</cbc:PayableAmount>
  </cac:RequestedMonetaryTotal>
  <cbc:Note languageLocaleID="1000"><![CDATA[${montoEnLetras(nota.total)}]]></cbc:Note>
${nota.detalles
  .map((detalle, indice) =>
    construirLineaAjuste(
      detalle,
      indice,
      tasaIgv,
      'DebitNoteLine',
      'DebitedQuantity',
      detalle.producto?.unidadMedida.codigo ?? 'NIU',
    ),
  )
  .join('\n')}
</DebitNote>`;
}
