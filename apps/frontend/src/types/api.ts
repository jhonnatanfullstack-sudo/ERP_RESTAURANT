export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiError {
  success: false;
  message: string;
  details: string[];
}

export interface Permiso {
  id: string;
  codigo: string;
  descripcion: string | null;
}

export interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
  permisos: Permiso[];
}

export interface TipoDocumentoIdentidad {
  id: string;
  codigo: string;
  nombre: string;
}

export interface Empresa {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  ubigeo: string | null;
  logo: string | null;
}

/** Vista pública de la empresa (GET /api/empresas/publico, sin autenticación) — solo lo
 * que un cliente externo puede ver en la carta digital. `null` si aún no se configuró
 * ninguna empresa activa. */
export interface EmpresaPublica {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  logo: string | null;
}

export interface Personal {
  id: string;
  empresa: Empresa;
  tipoDocumentoIdentidad: TipoDocumentoIdentidad;
  numeroDocumento: string;
  /** null cuando es persona jurídica: en ese caso el nombre está en `razonSocial`. */
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  /** Solo para RUC de persona jurídica (empieza en "20"); excluyente con nombres/apellidos. */
  razonSocial: string | null;
  direccion: string | null;
  activo: boolean;
}

export interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface Marca {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface UnidadMedida {
  id: string;
  codigo: string;
  nombre: string;
}

export interface TipoComprobante {
  id: string;
  codigo: string;
  nombre: string;
}

export interface TipoAfectacionIgv {
  id: string;
  codigo: string;
  nombre: string;
}

export interface TipoOperacion {
  id: string;
  codigo: string;
  nombre: string;
}

export interface MedioPago {
  id: string;
  codigo: string;
  nombre: string;
}

export type TipoProducto = 'mercaderia' | 'servicio';

export interface Producto {
  id: string;
  categoria: Pick<Categoria, 'id' | 'nombre'>;
  marca: Pick<Marca, 'id' | 'nombre'> | null;
  unidadMedida: UnidadMedida;
  tipoAfectacionIgv: TipoAfectacionIgv;
  tipo: TipoProducto;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagenUrl: string | null;
  activo: boolean;
}

export interface Insumo {
  id: string;
  nombre: string;
  descripcion: string | null;
  unidadMedida: UnidadMedida;
  activo: boolean;
}

export interface RecetaInsumo {
  id: string;
  insumo: Insumo;
  cantidad: number;
}

export interface Almacen {
  id: string;
  empresa: Pick<Empresa, 'id' | 'razonSocial'>;
  nombre: string;
  direccion: string | null;
  esPrincipal: boolean;
  activo: boolean;
}

export type TipoMovimientoExistencia =
  'inicial' | 'compra' | 'ajuste_entrada' | 'ajuste_salida' | 'consumo_cocina' | 'venta_directa';

export interface StockItem {
  almacenId: string;
  insumoId: string | null;
  productoId: string | null;
  stock: number;
}

export interface Existencia {
  id: string;
  almacen: Pick<Almacen, 'id' | 'nombre'>;
  insumo: Pick<Insumo, 'id' | 'nombre' | 'unidadMedida'> | null;
  producto: Pick<Producto, 'id' | 'nombre'> | null;
  tipo: TipoMovimientoExistencia;
  cantidad: number;
  costoUnitario: number | null;
  usuario: Pick<Usuario, 'id' | 'personal'> | null;
  observacion: string | null;
  creadoEn: string;
}

export interface Salon {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface Mesa {
  id: string;
  salon: Pick<Salon, 'id' | 'nombre'>;
  numero: string;
  capacidad: number;
  activo: boolean;
}

export interface Cliente {
  id: string;
  nombres: string | null;
  apellidos: string | null;
  /** Solo para RUC de persona jurídica (empieza en "20"); mutuamente excluyente con nombres/apellidos. */
  razonSocial: string | null;
  tipoDocumentoIdentidad: TipoDocumentoIdentidad | null;
  numeroDocumento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
}

export interface DatosDocumento {
  numeroDocumento: string;
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  razonSocial: string | null;
  /** Domicilio fiscal. SUNAT lo devuelve para RUC; por DNI suele llegar null. */
  direccion: string | null;
}

export type EstadoReserva = 'pendiente' | 'confirmada' | 'cancelada' | 'completada';

export interface Reserva {
  id: string;
  cliente: Pick<Cliente, 'id' | 'nombres' | 'apellidos' | 'razonSocial' | 'telefono'>;
  mesa: Mesa;
  fechaHora: string;
  duracionMinutos: number;
  cantidadPersonas: number;
  estado: EstadoReserva;
  notas: string | null;
}

export type EstadoPedido = 'abierto' | 'cerrado' | 'cancelado';
export type EstadoComanda = 'pendiente' | 'en_preparacion' | 'listo' | 'entregado' | 'cancelada';

export interface DetallePedido {
  id: string;
  producto: Pick<Producto, 'id' | 'nombre' | 'imagenUrl'>;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  notas: string | null;
  comanda: Pick<Comanda, 'id' | 'estado'> | null;
}

export interface Pedido {
  id: string;
  /** null cuando el pedido es "para llevar" (sin mesa asignada). */
  mesa: Mesa | null;
  cliente: Pick<Cliente, 'id' | 'nombres' | 'apellidos' | 'razonSocial'> | null;
  estado: EstadoPedido;
  total: number;
  notas: string | null;
  fechaCierre: string | null;
  detalles: DetallePedido[];
  creadoEn: string;
}

export interface Comanda {
  id: string;
  pedido: Pick<Pedido, 'id' | 'mesa' | 'estado'>;
  estado: EstadoComanda;
  notas: string | null;
  detalles: DetallePedido[];
  creadoEn: string;
}

export type FormaPago = 'contado' | 'credito';
export type EstadoVenta = 'emitida' | 'anulada';

export interface DetalleVenta {
  id: string;
  producto: Pick<Producto, 'id' | 'nombre'>;
  descripcionProducto: string;
  cantidad: number;
  precioUnitario: number;
  tipoAfectacionIgv: TipoAfectacionIgv;
  valorVenta: number;
  igv: number;
  subtotal: number;
}

export interface Venta {
  id: string;
  /** null en una venta directa (sin pedido de origen: los productos se venden sueltos). */
  pedido: Pick<Pedido, 'id' | 'mesa' | 'estado' | 'total' | 'creadoEn'> | null;
  cliente: Pick<
    Cliente,
    'id' | 'nombres' | 'apellidos' | 'razonSocial' | 'numeroDocumento' | 'tipoDocumentoIdentidad'
  > | null;
  tipoComprobante: TipoComprobante;
  serie: string;
  numero: number;
  tipoOperacion: TipoOperacion;
  formaPago: FormaPago;
  medioPago: MedioPago | null;
  subtotal: number;
  igv: number;
  total: number;
  tipoCambio: number | null;
  estado: EstadoVenta;
  detalles: DetalleVenta[];
  creadoEn: string;
}

export interface Usuario {
  id: string;
  email: string;
  activo: boolean;
  personal: Pick<
    Personal,
    'id' | 'nombres' | 'apellidoPaterno' | 'apellidoMaterno' | 'razonSocial'
  >;
  rol: Pick<Rol, 'id' | 'nombre'>;
}

export type EstadoCaja = 'abierta' | 'cerrada';
export type TipoMovimientoCaja = 'ingreso' | 'egreso';

export interface MovimientoCaja {
  id: string;
  usuario: Pick<Usuario, 'id' | 'personal'>;
  tipo: TipoMovimientoCaja;
  monto: number;
  concepto: string;
  creadoEn: string;
}

export interface Caja {
  id: string;
  usuarioApertura: Pick<Usuario, 'id' | 'personal'>;
  usuarioCierre: Pick<Usuario, 'id' | 'personal'> | null;
  montoApertura: number;
  observacionApertura: string | null;
  montoEsperado: number | null;
  montoDeclarado: number | null;
  diferencia: number | null;
  observacionCierre: string | null;
  estado: EstadoCaja;
  movimientos: MovimientoCaja[];
  creadoEn: string;
  fechaCierre: string | null;
}

export interface UsuarioAutenticado {
  id: string;
  email: string;
  activo: boolean;
  personal: {
    id: string;
    nombres: string | null;
    apellidoPaterno: string | null;
    apellidoMaterno: string | null;
    razonSocial: string | null;
  };
  rol: { id: string; nombre: string; permisos: string[] };
}
