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
import { TipoComprobante } from '../catalogos/tipo-comprobante.entity';
import { MotivoNota } from '../catalogos/motivo-nota.entity';
import { EstadoComprobante } from '../facturacion/comprobante-electronico.entity';
import { DetalleNotaVenta } from './detalle-nota-venta.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/**
 * Nota de Crédito (07) o Nota de Débito (08) que corrige o complementa una `Venta` ya emitida
 * a SUNAT. Mismo patrón que `GuiaRemision`: guarda su propio XML UBL 2.1 firmado y el CDR en
 * sus propias columnas (no comparte tabla con `ComprobanteElectronico`, que es 1 a 1 con
 * `Venta`) porque el envío al OSE es un paso posterior y reintentable, independiente de la
 * venta que referencia.
 *
 * A diferencia de la guía de remisión, acá `venta` es obligatoria: una nota SIEMPRE corrige o
 * complementa un comprobante que ya existe — no tiene sentido por sí sola.
 */
@Entity('notas_venta')
@Index('IDX_un_correlativo_por_serie_nota', ['empresa', 'serie', 'numero'], { unique: true })
export class NotaVenta {
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

  /** '07' Nota de Crédito o '08' Nota de Débito — determina el `motivo` válido y la etiqueta
   * en la interfaz. */
  @ManyToOne(() => TipoComprobante, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_comprobante_id' })
  tipoComprobante!: TipoComprobante;

  /** Venta que esta nota corrige o complementa. Siempre debe tener ya un comprobante
   * electrónico aceptado/observado — ver `nota-venta.service.ts: crearNotaCredito`. */
  @ManyToOne(() => Venta, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta;

  @ManyToOne(() => MotivoNota, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'motivo_id' })
  motivo!: MotivoNota;

  @Column({ name: 'descripcion_sustento', type: 'varchar', length: 255, nullable: true })
  descripcionSustento!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  subtotal!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  igv!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  total!: number;

  @OneToMany(() => DetalleNotaVenta, (detalle) => detalle.notaVenta)
  detalles!: DetalleNotaVenta[];

  /** Nombre normativo del archivo: `RUC-TIPO-SERIE-CORRELATIVO`, igual que en
   * `ComprobanteElectronico`/`GuiaRemision`. */
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
