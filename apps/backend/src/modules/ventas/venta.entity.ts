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
import { Pedido } from '../pedidos/pedido.entity';
import { Cliente } from '../clientes/cliente.entity';
import { TipoComprobante } from '../catalogos/tipo-comprobante.entity';
import { TipoOperacion } from '../catalogos/tipo-operacion.entity';
import { MedioPago } from '../catalogos/medio-pago.entity';
import { DetalleVenta } from './detalle-venta.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

export enum FormaPago {
  CONTADO = 'contado',
  CREDITO = 'credito',
}

export enum EstadoVenta {
  EMITIDA = 'emitida',
  ANULADA = 'anulada',
}

@Entity('ventas')
@Index(['pedido'], { unique: true })
@Index(['tipoComprobante', 'serie', 'numero'], { unique: true })
export class Venta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Pedido, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pedido_id' })
  pedido!: Pedido;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente | null;

  @ManyToOne(() => TipoComprobante, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_comprobante_id' })
  tipoComprobante!: TipoComprobante;

  @Column({ type: 'varchar', length: 4 })
  serie!: string;

  @Column({ type: 'int' })
  numero!: number;

  @ManyToOne(() => TipoOperacion, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_operacion_id' })
  tipoOperacion!: TipoOperacion;

  @Column({ name: 'forma_pago', type: 'enum', enum: FormaPago, default: FormaPago.CONTADO })
  formaPago!: FormaPago;

  @ManyToOne(() => MedioPago, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'medio_pago_id' })
  medioPago!: MedioPago | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  subtotal!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  igv!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  total!: number;

  /** Tipo de cambio USD/PEN (venta) publicado por SUNAT en la fecha de emisión, solo de
   * referencia contable — esta venta siempre se cobra en soles. Nullable: si la consulta al
   * proveedor externo falla, la venta igual se registra (ver tipo-cambio.service.ts). */
  @Column({
    name: 'tipo_cambio',
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  tipoCambio!: number | null;

  @Column({ type: 'enum', enum: EstadoVenta, default: EstadoVenta.EMITIDA })
  estado!: EstadoVenta;

  @OneToMany(() => DetalleVenta, (detalle) => detalle.venta)
  detalles!: DetalleVenta[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
