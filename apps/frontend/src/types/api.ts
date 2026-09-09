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

export interface Producto {
  id: string;
  categoria: Pick<Categoria, 'id' | 'nombre'>;
  marca: Pick<Marca, 'id' | 'nombre'> | null;
  unidadMedida: UnidadMedida;
  tipoAfectacionIgv: TipoAfectacionIgv;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagenUrl: string | null;
  activo: boolean;
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
  mesa: Mesa;
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
  pedido: Pick<Pedido, 'id' | 'mesa' | 'estado' | 'total' | 'creadoEn'>;
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
