import { tenantRepository } from '../../database/tenant-repository';
import { Pedido } from './pedido.entity';
import { DetallePedido } from './detalle-pedido.entity';

export const pedidoRepository = tenantRepository(Pedido);
export const detallePedidoRepository = tenantRepository(DetallePedido);
