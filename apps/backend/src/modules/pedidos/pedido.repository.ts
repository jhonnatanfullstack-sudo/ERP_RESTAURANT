import { AppDataSource } from '../../database/data-source';
import { Pedido } from './pedido.entity';
import { DetallePedido } from './detalle-pedido.entity';

export const pedidoRepository = AppDataSource.getRepository(Pedido);
export const detallePedidoRepository = AppDataSource.getRepository(DetallePedido);
