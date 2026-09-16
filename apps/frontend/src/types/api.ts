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

export interface Pais {
  id: string;
  codigoIso2: string;
  codigoIso3: string;
  nombre: string;
}

/** Departamento (nivel 1), provincia (nivel 2) o distrito (nivel 3) — o el equivalente de
 * cualquier otro país. `padre` viaja anidado cuando el backend lo pide explícitamente (ver
 * `Empresa.distrito`), para poder preseleccionar los combos superiores sin otra consulta. */
export interface DivisionAdministrativa {
  id: string;
  nivel: number;
  nombre: string;
  codigo: string | null;
  padre?: DivisionAdministrativa | null;
}

export interface Empresa {
  id: string;
  /** Identificador de la carta pública: `/carta/:slug`. */
  slug: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccionFiscal: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  ubigeo: string | null;
  pais: Pais | null;
  distrito: DivisionAdministrativa | null;
  logo: string | null;
  /** Acogida al régimen especial de IGV para MYPE de restaurantes/hoteles (10.5% en vez del
   * 18% general) — no es automático, requiere acogimiento explícito ante SUNAT. */
  acogidoRegimenMypeRestaurantes: boolean;
}

/** Vista pública de la empresa (GET /api/empresas/publico, sin autenticación) — solo lo
 * que un cliente externo puede ver en la carta digital. `null` si aún no se configuró
 * ninguna empresa activa. */
export interface EmpresaPublica {
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  logo: string | null;
  // Subconjunto público de la configuración (FASE 21): viaja junto a la empresa porque la
  // carta lo necesita en el mismo momento para pintar su cabecera y su pie.
  horarioAtencion: string | null;
  mensajeBienvenida: string | null;
  aceptaPedidosWhatsapp: boolean;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  /** QR de cobro que el restaurante subió en Configuración — se muestra en el carrito cuando
   * el cliente elige pagar con ese medio. */
  qrPagoYape: string | null;
  qrPagoPlin: string | null;
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
  /** Si exige registrar banco y número de operación (transferencia, depósito, cheque). */
  requiereBanco: boolean;
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
  nombreCompleto: string;
}

export interface Insumo {
  id: string;
  nombre: string;
  descripcion: string | null;
  unidadMedida: UnidadMedida;
  tipoAfectacionIgv: TipoAfectacionIgv;
  activo: boolean;
  /** Costo unitario de compra más reciente (cualquier almacén) — `null` si nunca se compró.
   * Solo lo devuelve `GET /api/insumos` (listado), no viene en cada relación anidada. */
  ultimoCosto?: number | null;
}

/** Por qué un producto no se puede costear todavía (FASE 18). */
export type MotivoSinCosteo = 'sin_receta' | 'sin_costos';

/** De dónde salió el costo: de una compra registrada (con desglose de IGV real) o de un
 * movimiento de inventario tipeado a mano. */
export type OrigenCosto = 'compra' | 'manual';

export interface LineaCosteo {
  insumoId: string;
  nombre: string;
  unidadMedida: string;
  cantidad: number;
  costoUnitario: number | null;
  costoLinea: number | null;
  origenCosto: OrigenCosto | null;
}

export interface CosteoProducto {
  productoId: string;
  nombre: string;
  tipo: TipoProducto;
  categoria: { id: string; nombre: string };
  /** Precio de carta, con IGV incluido. */
  precio: number;
  /** Precio sin IGV: la base contra la que se mide el margen. */
  valorVenta: number;
  costo: number | null;
  costoCompleto: boolean;
  componentesSinCosto: string[];
  margen: number | null;
  margenPorcentaje: number | null;
  /** "Food cost": costo sobre el valor de venta, en porcentaje. */
  costoPorcentaje: number | null;
  motivoSinCosteo: MotivoSinCosteo | null;
  origenCosto: OrigenCosto | null;
  lineas: LineaCosteo[];
}

export interface ResumenCosteo {
  tasaIgv: number;
  sinCostear: number;
  margenPromedioPorcentaje: number | null;
  productos: CosteoProducto[];
}

export interface RecetaInsumo {
  id: string;
  insumo: Insumo & { ultimoCosto: number | null };
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
  | 'inicial'
  | 'compra'
  | 'ajuste_entrada'
  | 'ajuste_salida'
  | 'consumo_cocina'
  | 'venta_directa'
  | 'anulacion_compra';

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

export interface Proveedor {
  id: string;
  nombres: string | null;
  apellidos: string | null;
  /** Solo para RUC de persona jurídica (empieza en "20"); mutuamente excluyente con nombres/apellidos. */
  razonSocial: string | null;
  tipoDocumentoIdentidad: TipoDocumentoIdentidad;
  numeroDocumento: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  activo: boolean;
}

export type EstadoCompra = 'registrada' | 'anulada';

export interface DetalleCompra {
  id: string;
  insumo: Pick<Insumo, 'id' | 'nombre' | 'unidadMedida'> | null;
  producto: Pick<Producto, 'id' | 'nombre'> | null;
  descripcionItem: string;
  cantidad: number;
  costoUnitario: number;
  tipoAfectacionIgv: TipoAfectacionIgv;
  valorCompra: number;
  igv: number;
  subtotal: number;
}

export interface Compra {
  id: string;
  proveedor: Pick<Proveedor, 'id' | 'nombres' | 'apellidos' | 'razonSocial' | 'numeroDocumento'>;
  almacen: Pick<Almacen, 'id' | 'nombre'>;
  tipoComprobante: TipoComprobante | null;
  serie: string | null;
  numero: string | null;
  fechaEmision: string;
  /** Si el `costoUnitario` de cada línea ya incluye IGV (lo usual) o no — cuando no, el IGV se
   * suma aparte a cada línea. Se decide una sola vez por compra, no por línea. */
  incluyeIgv: boolean;
  subtotal: number;
  igv: number;
  total: number;
  estado: EstadoCompra;
  observacion: string | null;
  usuario: Pick<Usuario, 'id' | 'personal'>;
  detalles: DetalleCompra[];
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
/** Por dónde entró el pedido: `salon` lo abre un mesero; los otros tres los crea el propio
 * cliente desde la carta pública, sin autenticarse. */
export type CanalOrigenPedido = 'salon' | 'autopedido' | 'delivery' | 'recojo';
/** Lo que el cliente dice que va a usar para pagar en un pedido público — no es un cobro real
 * (eso sigue pasando por Caja al cerrar la venta). */
export type MedioPagoPreferido = 'efectivo' | 'yape' | 'plin' | 'tarjeta';

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
  canalOrigen: CanalOrigenPedido;
  /** Solo en un pedido público (`autopedido`/`delivery`/`recojo`) — quien lo abre desde el
   * salón no necesita decir su nombre, está ahí. */
  contactoNombre: string | null;
  contactoTelefono: string | null;
  /** Solo aplica a `delivery`. */
  direccionEntrega: string | null;
  /** Solo se llena en un pedido público. */
  medioPagoPreferido: MedioPagoPreferido | null;
  /** Con cuánto dice el cliente que va a pagar en efectivo, para preparar el vuelto. */
  vueltoPara: number | null;
  total: number;
  notas: string | null;
  fechaCierre: string | null;
  detalles: DetallePedido[];
  creadoEn: string;
}

/** Lo que ve un visitante de la carta pública sobre "su" mesa antes de pedir — solo lo
 * necesario para confirmarle "vas a pedir para la Mesa 5" (`GET /api/publico/:slug/mesas/:id`). */
export interface MesaPublica {
  id: string;
  numero: string;
  salon: string;
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

export interface Banco {
  id: string;
  /** Código SBS de la entidad financiera. */
  codigo: string;
  nombre: string;
}

export interface TalonarioUsuarioAsignado {
  id: string;
  usuario: Pick<Usuario, 'id' | 'email' | 'personal'>;
}

/** Serie de comprobantes con su correlativo vigente. `siguienteNumero` lo calcula el backend
 * (`talonario.service.ts`): es el número que le tocará al próximo comprobante. */
export interface Talonario {
  id: string;
  empresa: Pick<Empresa, 'id' | 'razonSocial'>;
  tipoComprobante: TipoComprobante;
  almacen: Pick<Almacen, 'id' | 'nombre'>;
  serie: string;
  /** Último número emitido; 0 si el talonario todavía no emitió nada. */
  numeroActual: number;
  numeroInicio: number;
  numeroFin: number;
  activo: boolean;
  usuarios: TalonarioUsuarioAsignado[];
  siguienteNumero: number;
  siguienteNumeroFormateado: string;
  numerosDisponibles: number;
  agotado: boolean;
  creadoEn: string;
}

export interface Venta {
  id: string;
  /** Para el encabezado del ticket de impresión térmica (`TicketVenta.tsx`). */
  empresa: Pick<
    Empresa,
    'razonSocial' | 'nombreComercial' | 'ruc' | 'direccionFiscal' | 'telefono'
  >;
  /** null en una venta directa (sin pedido de origen: los productos se venden sueltos). */
  pedido: Pick<Pedido, 'id' | 'mesa' | 'estado' | 'total' | 'creadoEn'> | null;
  cliente: Pick<
    Cliente,
    'id' | 'nombres' | 'apellidos' | 'razonSocial' | 'numeroDocumento' | 'tipoDocumentoIdentidad'
  > | null;
  tipoComprobante: TipoComprobante;
  /** null en las ventas emitidas antes del módulo de talonarios (serie fija por comprobante). */
  talonario: Pick<Talonario, 'id' | 'serie'> | null;
  serie: string;
  numero: number;
  tipoOperacion: TipoOperacion;
  formaPago: FormaPago;
  medioPago: MedioPago | null;
  /** Entidad financiera del cobro al contado bancarizado; null si fue en efectivo o al crédito. */
  banco: Banco | null;
  numeroOperacion: string | null;
  subtotal: number;
  igv: number;
  total: number;
  /** Propina voluntaria del cliente — no es parte del precio de venta ni paga IGV, así que
   * queda fuera de `subtotal`/`igv`/`total`. Lo que el cliente entrega en total es
   * `total + propina`. */
  propina: number;
  tipoCambio: number | null;
  estado: EstadoVenta;
  detalles: DetalleVenta[];
  creadoEn: string;
}

export type EstadoComprobante =
  'pendiente' | 'aceptado' | 'observado' | 'rechazado' | 'error_envio';

/** Representación electrónica de una `Venta` ante SUNAT (FASE 28): el XML UBL 2.1 firmado y
 * la constancia (CDR) que el OSE devolvió. `null` cuando la venta todavía no se emitió. */
export interface ComprobanteElectronico {
  id: string;
  nombreArchivo: string;
  estado: EstadoComprobante;
  xmlFirmado: string;
  cdrXml: string | null;
  codigoRespuesta: string | null;
  mensajeRespuesta: string | null;
  intentos: number;
  enviadoEn: string | null;
  oseProveedor: string | null;
}

export type ProveedorOse = 'nubefact';
export type AmbienteFacturacion = 'beta' | 'produccion';

/** Estado de la configuración de facturación electrónica de la empresa — nunca trae el
 * certificado ni las credenciales en claro, solo si ya están cargados (FASE 28). */
export interface ConfiguracionFacturacion {
  oseProveedor: ProveedorOse | null;
  oseUsuario: string | null;
  tieneCredencialOse: boolean;
  tieneCertificado: boolean;
  certificadoValidoHasta: string | null;
  ambiente: AmbienteFacturacion;
  activo: boolean;
}

/** Catálogo SUNAT N° 20 (subconjunto para restaurante). */
export interface MotivoTraslado {
  id: string;
  codigo: string;
  nombre: string;
}

/** Catálogo SUNAT N° 18: `01` transporte público, `02` transporte privado. */
export interface ModalidadTraslado {
  id: string;
  codigo: string;
  nombre: string;
}

export interface DetalleGuiaRemision {
  id: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: UnidadMedida;
}

/** Guía de Remisión Electrónica del remitente (`09`) — mismo ciclo de vida que
 * `ComprobanteElectronico` (pendiente → aceptado/observado/rechazado/error_envio), pero
 * `venta` es opcional: la mayoría de traslados de un restaurante (insumos entre almacenes
 * propios) no nace de una venta. */
export interface GuiaRemision {
  id: string;
  talonario: Pick<Talonario, 'id' | 'serie'>;
  serie: string;
  numero: number;
  venta: Pick<Venta, 'id' | 'serie' | 'numero'> | null;
  motivoTraslado: MotivoTraslado;
  modalidadTraslado: ModalidadTraslado;
  fechaTraslado: string;
  pesoTotalKg: number;
  numeroBultos: number | null;
  partidaDireccion: string;
  partidaUbigeo: string | null;
  llegadaDireccion: string;
  llegadaUbigeo: string | null;
  destinatarioNumeroDocumento: string | null;
  destinatarioNombre: string | null;
  transportistaPlaca: string | null;
  transportistaLicencia: string | null;
  transportistaRuc: string | null;
  transportistaRazonSocial: string | null;
  observacion: string | null;
  detalles: DetalleGuiaRemision[];
  nombreArchivo: string;
  estado: EstadoComprobante;
  xmlFirmado: string;
  cdrXml: string | null;
  codigoRespuesta: string | null;
  mensajeRespuesta: string | null;
  intentos: number;
  enviadoEn: string | null;
  oseProveedor: string | null;
  creadoEn: string;
}

/** Catálogos SUNAT N° 09 (motivo de Nota de Crédito, `tipoDocumento` '07') y N° 10 (motivo de
 * Nota de Débito, `tipoDocumento` '08'). */
export interface MotivoNota {
  id: string;
  tipoDocumento: '07' | '08';
  codigo: string;
  nombre: string;
}

export interface DetalleNotaVenta {
  id: string;
  producto: Pick<Producto, 'id' | 'nombre'> | null;
  descripcionProducto: string;
  cantidad: number;
  precioUnitario: number;
  valorVenta: number;
  igv: number;
  subtotal: number;
}

/** Nota de Crédito (07) o Nota de Débito (08) que corrige o complementa una `Venta` ya emitida
 * a SUNAT — mismo ciclo de vida que `ComprobanteElectronico`/`GuiaRemision`. */
export interface NotaVenta {
  id: string;
  talonario: Pick<Talonario, 'id' | 'serie'>;
  serie: string;
  numero: number;
  tipoComprobante: TipoComprobante;
  venta: Pick<Venta, 'id' | 'serie' | 'numero' | 'tipoComprobante'>;
  motivo: MotivoNota;
  descripcionSustento: string | null;
  subtotal: number;
  igv: number;
  total: number;
  detalles: DetalleNotaVenta[];
  nombreArchivo: string;
  estado: EstadoComprobante;
  xmlFirmado: string;
  cdrXml: string | null;
  codigoRespuesta: string | null;
  mensajeRespuesta: string | null;
  intentos: number;
  enviadoEn: string | null;
  oseProveedor: string | null;
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

export type EstadoTurno = 'abierto' | 'cerrado';

export interface Turno {
  id: string;
  usuario: Pick<Usuario, 'id' | 'personal'>;
  usuarioCierre: Pick<Usuario, 'id' | 'personal'> | null;
  notaApertura: string | null;
  notaCierre: string | null;
  estado: EstadoTurno;
  creadoEn: string;
  fechaCierre: string | null;
}

export type MetodoRepartoPropina = 'igualitario' | 'por_horas';

export interface DetalleRepartoPropina {
  id: string;
  usuario: Pick<Usuario, 'id' | 'personal'>;
  horasTrabajadas: number | null;
  monto: number;
}

/** Reparto de las propinas recaudadas en un período entre el personal que trabajó en él (ver
 * `turnos`) — registro de cierre, no editable una vez creado. */
export interface RepartoPropina {
  id: string;
  fechaDesde: string;
  fechaHasta: string;
  metodo: MetodoRepartoPropina;
  totalPropinas: number;
  usuarioRegistro: Pick<Usuario, 'id' | 'personal'>;
  observacion: string | null;
  detalles: DetalleRepartoPropina[];
  creadoEn: string;
}

/** Participante calculado por `GET /api/propinas/vista-previa`, antes de confirmar el reparto
 * — no tiene `id` propio porque todavía no se guardó nada. */
export interface ParticipanteVistaPreviaPropina {
  usuario: Pick<Usuario, 'id' | 'personal'>;
  horas: number | null;
  monto: number;
}

export interface VistaPreviaRepartoPropina {
  totalPropinas: number;
  participantes: ParticipanteVistaPreviaPropina[];
}

export type TipoNotificacion = 'comanda_lista' | 'pedido_nuevo' | 'reclamo_nuevo';

/** Notificación del equipo — bandeja compartida por empresa (ver `notificacion.entity.ts` en
 * el backend): quien la marca leída la marca leída para todos. */
export interface Notificacion {
  id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  entidadTipo: string | null;
  entidadId: string | null;
  leida: boolean;
  creadoEn: string;
}

export type TipoMovimientoFidelizacion = 'ganado' | 'canjeado' | 'ajuste';

/** Un movimiento del kardex de puntos de un cliente (ver `movimiento-fidelizacion.entity.ts`
 * en el backend) — el saldo es la suma con signo de sus movimientos, nunca un número aparte. */
export interface MovimientoFidelizacion {
  id: string;
  tipo: TipoMovimientoFidelizacion;
  puntos: number;
  venta: Pick<Venta, 'id' | 'serie' | 'numero'> | null;
  usuario: Pick<Usuario, 'id' | 'personal'> | null;
  observacion: string | null;
  creadoEn: string;
}

export interface UsuarioAutenticado {
  id: string;
  email: string;
  activo: boolean;
  /** Marca al proveedor del sistema: habilita el panel transversal `/plataforma`. */
  esProveedor: boolean;
  personal: {
    id: string;
    nombres: string | null;
    apellidoPaterno: string | null;
    apellidoMaterno: string | null;
    razonSocial: string | null;
  };
  rol: { id: string; nombre: string; permisos: string[] };
}

/** Un par etiqueta/valor de un reporte, tal cual lo devuelve el backend (sin `detalle`, que
 * es cosa de la vista). */
export interface PuntoReporte {
  etiqueta: string;
  valor: number;
}

export interface ResumenReporte {
  ventasTotal: number;
  ventasSubtotal: number;
  ventasIgv: number;
  numeroVentas: number;
  ticketPromedio: number;
  clientesAtendidos: number;
  comprasTotal: number;
  numeroCompras: number;
  /** Ventas sin IGV menos compras sin IGV. No es utilidad contable (no descuenta planilla,
   * alquiler ni servicios): es el margen bruto de mercadería del período. */
  margenBruto: number;
}

export interface ProductoReporte {
  nombre: string;
  categoria: string;
  cantidad: number;
  total: number;
}

export interface ClienteReporte {
  id: string;
  nombre: string;
  documento: string | null;
  visitas: number;
  total: number;
  ticketPromedio: number;
  ultimaVisita: string;
}

export interface ProveedorReporte {
  nombre: string;
  documento: string;
  compras: number;
  total: number;
}

export interface Reporte {
  desde: string;
  hasta: string;
  resumen: ResumenReporte;
  ventasPorDia: PuntoReporte[];
  ventasPorHora: PuntoReporte[];
  ventasPorCategoria: PuntoReporte[];
  ventasPorMedioPago: PuntoReporte[];
  ventasPorTipoComprobante: PuntoReporte[];
  topProductos: ProductoReporte[];
  clientes: ClienteReporte[];
  proveedores: ProveedorReporte[];
}

export type AccionAuditoria =
  'crear' | 'actualizar' | 'eliminar' | 'anular' | 'login' | 'login_fallido' | 'logout';

export interface RegistroAuditoria {
  id: string;
  /** `null` en intentos de login fallidos: aún no había sesión que atribuir. */
  usuario: Pick<Usuario, 'id' | 'email' | 'personal'> | null;
  accion: AccionAuditoria;
  modulo: string;
  recursoId: string | null;
  metodo: string;
  ruta: string;
  estadoHttp: number;
  ip: string | null;
  /** Cuerpo de la petición con los campos sensibles ya redactados por el backend. */
  datos: Record<string, unknown> | null;
  creadoEn: string;
}

export interface PaginaAuditoria {
  registros: RegistroAuditoria[];
  total: number;
  pagina: number;
  porPagina: number;
}

export type EstadoCobranza = 'pendiente' | 'parcial' | 'pagada' | 'vencida';

/** Cuota del cronograma de una venta al crédito (exigido por SUNAT en el comprobante). */
export interface CuotaVenta {
  id: string;
  numero: number;
  monto: number;
  fechaVencimiento: string;
}

export interface PagoVenta {
  id: string;
  fechaPago: string;
  monto: number;
  medioPago: MedioPago;
  banco: Banco | null;
  numeroOperacion: string | null;
  observacion: string | null;
  anulado: boolean;
  motivoAnulacion: string | null;
  usuario: Pick<Usuario, 'id' | 'personal'>;
  creadoEn: string;
}

/** Documento por cobrar: la venta al crédito con su cronograma, sus cobros y el saldo, que
 * el backend calcula desde los pagos vigentes (nunca se guarda). */
export interface Cobranza {
  venta: Venta;
  cuotas: CuotaVenta[];
  pagos: PagoVenta[];
  total: number;
  pagado: number;
  saldo: number;
  estadoCobranza: EstadoCobranza;
  proximoVencimiento: string | null;
  diasVencido: number;
}

// --- Multi-empresa, demo y panel del proveedor (FASE 25-26) ---

export type EstadoSuscripcion =
  'activa' | 'demo' | 'demo_vencida' | 'suscripcion_vencida' | 'suspendida';
export type PlanEmpresa = 'demo' | 'activo';

export type PlanContratado = 'operativo' | 'facturacion' | 'completo';
export type CicloFacturacion = 'mensual' | 'trimestral' | 'anual';
export type EstadoSolicitudSuscripcion = 'pendiente' | 'confirmada' | 'rechazada';

/** Catálogo público de planes (FASE 29), lo que consume `/precios`. */
export interface PlanPublico {
  id: PlanContratado;
  nombre: string;
  descripcion: string;
  precioMensual: number;
  caracteristicas: string[];
  precios: Record<CicloFacturacion, number>;
}

export interface SolicitudSuscripcion {
  id: string;
  empresa: Pick<Empresa, 'id' | 'razonSocial' | 'nombreComercial' | 'ruc'>;
  plan: PlanContratado;
  ciclo: CicloFacturacion;
  meses: number;
  monto: number;
  estado: EstadoSolicitudSuscripcion;
  mensajeContacto: string | null;
  confirmadoEn: string | null;
  creadoEn: string;
}

export interface ContactoProveedor {
  nombre: string;
  email: string | null;
  telefono: string | null;
}

export interface ResumenSuscripcion {
  estado: EstadoSuscripcion;
  plan: PlanEmpresa;
  /** Días completos que quedan de prueba; `null` en una cuenta contratada. */
  diasRestantes: number | null;
  expiraEn: string | null;
  puedeEscribir: boolean;
  contactoProveedor: ContactoProveedor;
}

export interface InformacionDemo {
  diasDePrueba: number;
  proveedor: ContactoProveedor;
}

export interface SesionDemo {
  accessToken: string;
  empresa: { id: string; razonSocial: string; slug: string };
  suscripcion: ResumenSuscripcion;
}

export interface EmpresaEnPanel {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  slug: string;
  email: string | null;
  telefono: string | null;
  plan: PlanEmpresa;
  estado: EstadoSuscripcion;
  diasRestantes: number | null;
  expiraEn: string | null;
  creadaPorAutoservicio: boolean;
  creadoEn: string;
  peticiones: number;
  escrituras: number;
  diasConActividad: number;
  ultimoAcceso: string | null;
}

export interface PanelPlataforma {
  totalEmpresas: number;
  demosActivas: number;
  demosVencidas: number;
  clientesActivos: number;
  suspendidas: number;
  activasUltimos7Dias: number;
  empresas: EmpresaEnPanel[];
}

export interface UsoDiario {
  fecha: string;
  peticiones: number;
  escrituras: number;
}

export type AccionEmpresa =
  | { tipo: 'activar' }
  | { tipo: 'extender_demo'; dias: number }
  | { tipo: 'suspender' }
  | { tipo: 'reactivar' };

/** Parámetros operativos del restaurante (FASE 21). Lo que antes eran constantes fijas. */
export interface ConfiguracionRestaurante {
  duracionReservaMinutos: number;
  segundosRefrescoCocina: number;
  diasCreditoPorDefecto: number;
  /** Hasta este porcentaje de food cost un plato se considera sano. */
  foodCostObjetivo: number;
  /** A partir de este porcentaje el margen se considera crítico. */
  foodCostCritico: number;
  horarioAtencion: string | null;
  mensajeBienvenida: string | null;
  aceptaPedidosWhatsapp: boolean;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  /** QR estático de cobro (el que muestra la propia app de Yape/Plin al restaurante) — se
   * exhibe en caja al cobrar con ese medio de pago. `null` si no se subió ninguno. */
  qrPagoYape: string | null;
  qrPagoPlin: string | null;
  fidelizacionActiva: boolean;
  /** Cuánto hay que gastar (soles) para ganar 1 punto. */
  solesPorPunto: number;
  /** Cuánto vale 1 punto (soles) al canjearlo. */
  valorCanjePunto: number;
}

// --- Libro de Reclamaciones Virtual (Ley 29571) -----------------------------------------

/** Reclamo: disconformidad con el producto/servicio. Queja: disconformidad con la atención u
 * otro malestar que no tiene que ver con lo comprado — mismo criterio del formato oficial. */
export type TipoReclamacion = 'reclamo' | 'queja';
export type EstadoReclamacion = 'pendiente' | 'atendido';

/** Datos del proveedor para la cabecera del formulario público — a diferencia de
 * `EmpresaPublica` (la carta), acá el RUC sí es lo que el consumidor necesita ver. */
export interface EmpresaReclamaciones {
  razonSocial: string;
  ruc: string;
  direccion: string | null;
}

export interface Reclamacion {
  id: string;
  numero: number;
  tipo: TipoReclamacion;
  consumidorNombres: string;
  consumidorApellidos: string;
  tipoDocumentoIdentidad: TipoDocumentoIdentidad;
  consumidorNumeroDocumento: string;
  consumidorDomicilio: string;
  consumidorEmail: string;
  consumidorTelefono: string | null;
  esMenorEdad: boolean;
  apoderadoNombre: string | null;
  apoderadoNumeroDocumento: string | null;
  descripcionBien: string;
  montoReclamado: number | null;
  detalle: string;
  pedido: string;
  estado: EstadoReclamacion;
  respuestaProveedor: string | null;
  fechaRespuesta: string | null;
  usuarioAtendio: Pick<Usuario, 'id' | 'personal'> | null;
  creadoEn: string;
}
