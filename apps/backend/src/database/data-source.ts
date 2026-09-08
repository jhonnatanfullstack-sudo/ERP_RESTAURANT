import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { Usuario } from '../modules/usuarios/usuario.entity';
import { Rol } from '../modules/roles/rol.entity';
import { Permiso } from '../modules/permisos/permiso.entity';
import { RefreshToken } from '../modules/auth/refresh-token.entity';
import { Empresa } from '../modules/empresa/empresa.entity';
import { Personal } from '../modules/personal/personal.entity';
import { TipoDocumentoIdentidad } from '../modules/catalogos/tipo-documento-identidad.entity';
import { TipoComprobante } from '../modules/catalogos/tipo-comprobante.entity';
import { UnidadMedida } from '../modules/catalogos/unidad-medida.entity';
import { TipoAfectacionIgv } from '../modules/catalogos/tipo-afectacion-igv.entity';
import { TipoOperacion } from '../modules/catalogos/tipo-operacion.entity';
import { MedioPago } from '../modules/catalogos/medio-pago.entity';
import { Categoria } from '../modules/categorias/categoria.entity';
import { Marca } from '../modules/marcas/marca.entity';
import { Producto } from '../modules/productos/producto.entity';
import { Salon } from '../modules/salones/salon.entity';
import { Mesa } from '../modules/mesas/mesa.entity';
import { Cliente } from '../modules/clientes/cliente.entity';
import { Reserva } from '../modules/reservas/reserva.entity';
import { Pedido } from '../modules/pedidos/pedido.entity';
import { DetallePedido } from '../modules/pedidos/detalle-pedido.entity';
import { Comanda } from '../modules/cocina/comanda.entity';
import { Venta } from '../modules/ventas/venta.entity';
import { DetalleVenta } from '../modules/ventas/detalle-venta.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  username: env.db.user,
  password: env.db.password,
  synchronize: false,
  logging: env.nodeEnv === 'development',
  entities: [
    Empresa,
    Personal,
    TipoDocumentoIdentidad,
    TipoComprobante,
    UnidadMedida,
    TipoAfectacionIgv,
    TipoOperacion,
    MedioPago,
    Usuario,
    Rol,
    Permiso,
    RefreshToken,
    Categoria,
    Marca,
    Producto,
    Salon,
    Mesa,
    Cliente,
    Reserva,
    Pedido,
    DetallePedido,
    Comanda,
    Venta,
    DetalleVenta,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});
