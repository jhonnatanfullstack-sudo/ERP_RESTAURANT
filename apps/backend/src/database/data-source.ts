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
import { Banco } from '../modules/catalogos/banco.entity';
import { Pais } from '../modules/catalogos/pais.entity';
import { DivisionAdministrativa } from '../modules/catalogos/division-administrativa.entity';
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
import { Caja } from '../modules/caja/caja.entity';
import { MovimientoCaja } from '../modules/caja/movimiento-caja.entity';
import { Almacen } from '../modules/almacenes/almacen.entity';
import { Insumo } from '../modules/insumos/insumo.entity';
import { RecetaInsumo } from '../modules/recetas/receta-insumo.entity';
import { Existencia } from '../modules/inventario/existencia.entity';
import { Proveedor } from '../modules/proveedores/proveedor.entity';
import { Compra } from '../modules/compras/compra.entity';
import { DetalleCompra } from '../modules/compras/detalle-compra.entity';
import { ComprobanteElectronico } from '../modules/facturacion/comprobante-electronico.entity';
import { ConfiguracionFacturacion } from '../modules/facturacion/configuracion-facturacion.entity';
import { RegistroAuditoria } from '../modules/auditoria/registro-auditoria.entity';
import { Talonario } from '../modules/talonario/talonario.entity';
import { CuotaVenta } from '../modules/cobranzas/cuota-venta.entity';
import { PagoVenta } from '../modules/cobranzas/pago-venta.entity';
import { TalonarioUsuario } from '../modules/talonario/talonario-usuario.entity';
import { RegistroUso } from '../modules/suscripcion/registro-uso.entity';
import { SolicitudSuscripcion } from '../modules/suscripcion/solicitud-suscripcion.entity';
import { Configuracion } from '../modules/configuracion/configuracion.entity';
import { MotivoTraslado } from '../modules/catalogos/motivo-traslado.entity';
import { ModalidadTraslado } from '../modules/catalogos/modalidad-traslado.entity';
import { GuiaRemision } from '../modules/guias-remision/guia-remision.entity';
import { DetalleGuiaRemision } from '../modules/guias-remision/detalle-guia-remision.entity';
import { Reclamacion } from '../modules/reclamaciones/reclamacion.entity';
import { Turno } from '../modules/turnos/turno.entity';
import { MotivoNota } from '../modules/catalogos/motivo-nota.entity';
import { NotaVenta } from '../modules/notas-venta/nota-venta.entity';
import { DetalleNotaVenta } from '../modules/notas-venta/detalle-nota-venta.entity';
import { RepartoPropina } from '../modules/propinas/reparto-propina.entity';
import { DetalleRepartoPropina } from '../modules/propinas/detalle-reparto-propina.entity';
import { Notificacion } from '../modules/notificaciones/notificacion.entity';
import { MovimientoFidelizacion } from '../modules/fidelizacion/movimiento-fidelizacion.entity';

/**
 * Conexión de la aplicación. Usa el rol restringido (`DB_APP_USER`), **no** el dueño de las
 * tablas: es lo que hace que las políticas RLS de aislamiento entre empresas realmente
 * apliquen (un superusuario se las salta siempre). Las migraciones usan otra conexión, ver
 * `migration-data-source.ts`.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  username: env.db.appUser,
  password: env.db.appPassword,
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
    Banco,
    Pais,
    DivisionAdministrativa,
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
    Caja,
    MovimientoCaja,
    Almacen,
    Insumo,
    RecetaInsumo,
    Existencia,
    Proveedor,
    Compra,
    DetalleCompra,
    ComprobanteElectronico,
    ConfiguracionFacturacion,
    RegistroAuditoria,
    Talonario,
    TalonarioUsuario,
    CuotaVenta,
    PagoVenta,
    RegistroUso,
    SolicitudSuscripcion,
    Configuracion,
    MotivoTraslado,
    ModalidadTraslado,
    GuiaRemision,
    DetalleGuiaRemision,
    Reclamacion,
    Turno,
    MotivoNota,
    NotaVenta,
    DetalleNotaVenta,
    RepartoPropina,
    DetalleRepartoPropina,
    Notificacion,
    MovimientoFidelizacion,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});
