import { cantidad, escaparXml, fechaEmision } from '../../facturacion/ubl/xml.util';
import type { Empresa } from '../../empresa/empresa.entity';
import type { GuiaRemision } from '../guia-remision.entity';
import type { DetalleGuiaRemision } from '../detalle-guia-remision.entity';
import { CODIGO_GUIA_REMISION } from '../../catalogos/codigos-sunat';
import { CodigoModalidadTraslado } from '../guia-remision.entity';

/** Correlativo a 8 dígitos, mismo formato que `ventas`. */
export function numeroFormateado(guia: GuiaRemision): string {
  return `${guia.serie}-${String(guia.numero).padStart(8, '0')}`;
}

/** Nombre normativo del archivo y del ZIP: `RUC-TIPO-SERIE-CORRELATIVO`. */
export function nombreArchivo(empresa: Empresa, guia: GuiaRemision): string {
  return `${empresa.ruc}-${CODIGO_GUIA_REMISION}-${guia.serie}-${guia.numero}`;
}

function construirRemitente(empresa: Empresa): string {
  return `  <cac:DespatchSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${escaparXml(empresa.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${empresa.razonSocial}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:DespatchSupplierParty>`;
}

/** Destinatario: el propio emisor cuando el traslado es entre establecimientos propios (sin
 * `destinatarioNumeroDocumento`), o el tercero indicado. */
function construirDestinatario(empresa: Empresa, guia: GuiaRemision): string {
  const numeroDoc = guia.destinatarioNumeroDocumento ?? empresa.ruc;
  const nombre = guia.destinatarioNombre ?? empresa.razonSocial;
  return `  <cac:DeliveryCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${escaparXml(numeroDoc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${nombre}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:DeliveryCustomerParty>`;
}

function construirTransportista(guia: GuiaRemision): string {
  const esPrivado = guia.modalidadTraslado.codigo === CodigoModalidadTraslado.PRIVADO;

  if (esPrivado) {
    // Transporte privado: el vehículo va en `cac:TransportEquipment`, el conductor en
    // `cac:DriverPerson`, y no hay `cac:CarrierParty` (no hay un tercero transportista).
    return `      <cac:TransportEquipment>
        <cbc:ID>${escaparXml(guia.transportistaPlaca ?? '')}</cbc:ID>
      </cac:TransportEquipment>
      <cac:DriverPerson>
        <cbc:IdentityDocumentReference>${escaparXml(guia.transportistaLicencia ?? '')}</cbc:IdentityDocumentReference>
      </cac:DriverPerson>`;
  }

  return `      <cac:CarrierParty>
        <cac:PartyIdentification>
          <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${escaparXml(guia.transportistaRuc ?? '')}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyLegalEntity>
          <cbc:RegistrationName><![CDATA[${guia.transportistaRazonSocial ?? ''}]]></cbc:RegistrationName>
        </cac:PartyLegalEntity>
      </cac:CarrierParty>`;
}

function construirLinea(detalle: DetalleGuiaRemision, indice: number): string {
  return `  <cac:DespatchLine>
    <cbc:ID>${indice + 1}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${escaparXml(detalle.unidadMedida.codigo)}">${cantidad(detalle.cantidad)}</cbc:DeliveredQuantity>
    <cac:OrderLineReference>
      <cbc:LineID>${indice + 1}</cbc:LineID>
    </cac:OrderLineReference>
    <cac:Item>
      <cbc:Description><![CDATA[${detalle.descripcion}]]></cbc:Description>
    </cac:Item>
  </cac:DespatchLine>`;
}

interface OpcionesGuiaRemision {
  guia: GuiaRemision;
  empresa: Empresa;
}

/**
 * Genera el XML UBL 2.1 de una Guía de Remisión Electrónica del remitente (`09`) a partir de
 * una `GuiaRemision` ya registrada.
 *
 * **Nota de alcance.** A diferencia de `ubl/factura.builder.ts` (verificado contra el demo
 * real de NubeFacT durante FASE 28, ver `docs/decisiones-tecnicas.md`), esta estructura sigue
 * el esquema público de UBL 2.1 `DespatchAdvice` que exige SUNAT pero **todavía no se probó
 * contra el ambiente Beta real de un OSE** — antes de emitir en producción hay que validar al
 * menos un envío en Beta y ajustar lo que el CDR observe.
 */
export function construirXmlGuiaRemision({ guia, empresa }: OpcionesGuiaRemision): string {
  const emitidaEn = guia.creadoEn;

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
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
  <cbc:ID>${numeroFormateado(guia)}</cbc:ID>
  <cbc:IssueDate>${fechaEmision(emitidaEn)}</cbc:IssueDate>
  <cbc:DespatchAdviceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${CODIGO_GUIA_REMISION}</cbc:DespatchAdviceTypeCode>
  ${guia.observacion ? `<cbc:Note><![CDATA[${guia.observacion}]]></cbc:Note>` : ''}
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
${construirRemitente(empresa)}
${construirDestinatario(empresa, guia)}
  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cbc:HandlingCode listAgencyName="PE:SUNAT" listName="Motivo de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo20">${escaparXml(guia.motivoTraslado.codigo)}</cbc:HandlingCode>
    <cbc:GrossWeightMeasure unitCode="KGM">${cantidad(guia.pesoTotalKg)}</cbc:GrossWeightMeasure>
    ${guia.numeroBultos != null ? `<cbc:TotalTransportHandlingUnitQuantity>${guia.numeroBultos}</cbc:TotalTransportHandlingUnitQuantity>` : ''}
    <cac:ShipmentStage>
      <cbc:TransportModeCode listName="Modalidad de traslado" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo18">${escaparXml(guia.modalidadTraslado.codigo)}</cbc:TransportModeCode>
      <cac:TransitPeriod>
        <cbc:StartDate>${guia.fechaTraslado}</cbc:StartDate>
      </cac:TransitPeriod>
${construirTransportista(guia)}
    </cac:ShipmentStage>
    <cac:Delivery>
      <cac:DeliveryAddress>
        <cbc:ID>${escaparXml(guia.llegadaUbigeo ?? '')}</cbc:ID>
        <cac:AddressLine>
          <cbc:Line><![CDATA[${guia.llegadaDireccion}]]></cbc:Line>
        </cac:AddressLine>
      </cac:DeliveryAddress>
    </cac:Delivery>
    <cac:OriginAddress>
      <cbc:ID>${escaparXml(guia.partidaUbigeo ?? '')}</cbc:ID>
      <cac:AddressLine>
        <cbc:Line><![CDATA[${guia.partidaDireccion}]]></cbc:Line>
      </cac:AddressLine>
    </cac:OriginAddress>
  </cac:Shipment>
${guia.detalles.map((detalle, indice) => construirLinea(detalle, indice)).join('\n')}
</DespatchAdvice>`;
}
