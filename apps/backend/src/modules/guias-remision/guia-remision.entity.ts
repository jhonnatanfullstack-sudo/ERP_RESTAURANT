import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Talonario } from '../talonario/talonario.entity';
import { Venta } from '../ventas/venta.entity';
import { MotivoTraslado } from '../catalogos/motivo-traslado.entity';
import { ModalidadTraslado } from '../catalogos/modalidad-traslado.entity';
import { DetalleGuiaRemision } from './detalle-guia-remision.entity';
import { EstadoComprobante } from '../facturacion/comprobante-electronico.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/** Catálogo SUNAT N° 18: `01` transporte público (lo hace un tercero con RUC propio), `02`
 * transporte privado (lo hace la propia empresa con su vehículo). */
export enum CodigoModalidadTraslado {
  PUBLICO = '01',
  PRIVADO = '02',
}

/**
 * Guía de Remisión Electrónica (GRE) del remitente — comprobante `09` obligatorio desde
 * jul-2026 para trasladar insumos/mercadería (entre almacenes propios, o acompañando una venta
 * con reparto) sin exponerse a que SUNAT intervenga el transporte. Mismo patrón que
 * `ComprobanteElectronico`: guarda el XML UBL 2.1 firmado y el CDR tal cual se intercambiaron,
 * en su propia tabla porque el envío al OSE es un paso posterior y reintentable, independiente
 * de cuándo se registró el traslado.
 *
 * A diferencia de `ComprobanteElectronico` (1 a 1 con `Venta`), acá `venta` es opcional: la
 * mayoría de traslados de un restaurante (llevar insumos del almacén central a un local) no
 * nace de una venta.
 */
@Entity('guias_remision')
@Index('IDX_un_correlativo_por_serie_guia', ['empresa', 'serie', 'numero'], { unique: true })
export class GuiaRemision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => Talonario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'talonario_id' })
  talonario!: Talonario;

  @Column({ type: 'varchar', length: 4 })
  serie!: string;

  @Column({ type: 'int' })
  numero!: number;

  /** Venta que acompaña este traslado (ej. una entrega a un cliente con RUC) — `null` cuando
   * el motivo es un traslado entre establecimientos propios o cualquier otro sin venta detrás. */
  @ManyToOne(() => Venta, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta | null;

  @ManyToOne(() => MotivoTraslado, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'motivo_traslado_id' })
  motivoTraslado!: MotivoTraslado;

  @ManyToOne(() => ModalidadTraslado, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'modalidad_traslado_id' })
  modalidadTraslado!: ModalidadTraslado;

  @Column({ name: 'fecha_traslado', type: 'date' })
  fechaTraslado!: string;

  @Column({
    name: 'peso_total_kg',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  pesoTotalKg!: number;

  @Column({ name: 'numero_bultos', type: 'int', nullable: true })
  numeroBultos!: number | null;

  @Column({ name: 'partida_direccion', type: 'varchar', length: 255 })
  partidaDireccion!: string;

  @Column({ name: 'partida_ubigeo', type: 'varchar', length: 6, nullable: true })
  partidaUbigeo!: string | null;

  @Column({ name: 'llegada_direccion', type: 'varchar', length: 255 })
  llegadaDireccion!: string;

  @Column({ name: 'llegada_ubigeo', type: 'varchar', length: 6, nullable: true })
  llegadaUbigeo!: string | null;

  /** Destinatario del traslado. `null` cuando es entre establecimientos propios: SUNAT acepta
   * la GRE sin destinatario distinto del propio emisor en ese caso. */
  @Column({ name: 'destinatario_numero_documento', type: 'varchar', length: 15, nullable: true })
  destinatarioNumeroDocumento!: string | null;

  @Column({ name: 'destinatario_nombre', type: 'varchar', length: 150, nullable: true })
  destinatarioNombre!: string | null;

  /** Transporte privado: vehículo propio de la empresa. */
  @Column({ name: 'transportista_placa', type: 'varchar', length: 8, nullable: true })
  transportistaPlaca!: string | null;

  @Column({ name: 'transportista_licencia', type: 'varchar', length: 20, nullable: true })
  transportistaLicencia!: string | null;

  /** Transporte público: la empresa de transporte que hace el traslado. */
  @Column({ name: 'transportista_ruc', type: 'varchar', length: 11, nullable: true })
  transportistaRuc!: string | null;

  @Column({ name: 'transportista_razon_social', type: 'varchar', length: 150, nullable: true })
  transportistaRazonSocial!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  observacion!: string | null;

  @OneToMany(() => DetalleGuiaRemision, (detalle) => detalle.guiaRemision)
  detalles!: DetalleGuiaRemision[];

  /** Nombre normativo del archivo: `RUC-TIPO-SERIE-CORRELATIVO`, igual que en
   * `ComprobanteElectronico`. */
  @Column({ name: 'nombre_archivo', type: 'varchar', length: 60, unique: true })
  nombreArchivo!: string;

  @Column({ type: 'enum', enum: EstadoComprobante, default: EstadoComprobante.PENDIENTE })
  estado!: EstadoComprobante;

  @Column({ name: 'xml_firmado', type: 'text' })
  xmlFirmado!: string;

  @Column({ name: 'hash_firma', type: 'varchar', length: 100 })
  hashFirma!: string;

  @Column({ name: 'cdr_xml', type: 'text', nullable: true })
  cdrXml!: string | null;

  @Column({ name: 'codigo_respuesta', type: 'varchar', length: 10, nullable: true })
  codigoRespuesta!: string | null;

  @Column({ name: 'mensaje_respuesta', type: 'varchar', length: 500, nullable: true })
  mensajeRespuesta!: string | null;

  @Column({ type: 'int', default: 0 })
  intentos!: number;

  @Column({ name: 'enviado_en', type: 'timestamptz', nullable: true })
  enviadoEn!: Date | null;

  @Column({ name: 'ose_proveedor', type: 'varchar', length: 20, nullable: true })
  oseProveedor!: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
