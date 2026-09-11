import { tenantRepository } from '../../database/tenant-repository';
import { PagoVenta } from './pago-venta.entity';
import { CuotaVenta } from './cuota-venta.entity';

export const pagoVentaRepository = tenantRepository(PagoVenta);
export const cuotaVentaRepository = tenantRepository(CuotaVenta);
