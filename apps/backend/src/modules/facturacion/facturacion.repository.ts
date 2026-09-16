import { tenantRepository } from '../../database/tenant-repository';
import { ComprobanteElectronico } from './comprobante-electronico.entity';
import { ConfiguracionFacturacion } from './configuracion-facturacion.entity';

export const comprobanteElectronicoRepository = tenantRepository(ComprobanteElectronico);
export const configuracionFacturacionRepository = tenantRepository(ConfiguracionFacturacion);
