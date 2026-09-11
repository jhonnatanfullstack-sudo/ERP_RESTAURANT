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
import { Pedido } from '../pedidos/pedido.entity';
import { Cliente } from '../clientes/cliente.entity';
import { TipoComprobante } from '../catalogos/tipo-comprobante.entity';
import { TipoOperacion } from '../catalogos/tipo-operacion.entity';
import { MedioPago } from '../catalogos/medio-pago.entity';
import { DetalleVenta } from './detalle-venta.entity';
import { Talonario } from '../talonario/talonario.entity';
import { Banco } from '../catalogos/banco.entity';
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
// Nombre explícito (y no el autogenerado por TypeORM): `venta.service.ts` distingue por él
// una colisión de correlativo de cualquier otra violación de unicidad, para reintentar solo
// en ese caso. Ver `esColisionDeCorrelativo`.
@Index('IDX_un_correlativo_por_serie', ['empresa', 'tipoComprobante', 'serie', 'numero'], {
  unique: true,
})
export class Venta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  /** null en una venta directa (sin pedido de origen) — ver venta.service.ts: crearVenta.
   * El índice único de abajo sigue impidiendo dos ventas del mismo pedido: Postgres no
   * considera iguales dos NULL en una columna UNIQUE, así que admite cualquier cantidad
   * de ventas directas sin necesitar un índice parcial. */
  @ManyToOne(() => Pedido, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pedido_id' })
  pedido!: Pedido | null;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente | null;

  @ManyToOne(() => TipoComprobante, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_comprobante_id' })
  tipoComprobante!: TipoComprobante;

  /** Talonario del que salió `serie`/`numero`. Nullable: las ventas emitidas antes de existir
   * el módulo de talonarios (serie fija por tipo de comprobante) no tienen ninguno. */
  @ManyToOne(() => Talonario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'talonario_id' })
  talonario!: Talonario | null;

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

  /** Entidad financiera del cobro al contado, cuando el medio de pago es bancarizado
   * (depósito, transferencia, cheque). En una venta al crédito el banco va en cada
   * `PagoVenta`, no aquí: el dinero entra después y puede entrar por varias vías. */
  @ManyToOne(() => Banco, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'banco_id' })
  banco!: Banco | null;

  /** Número de operación/voucher del cobro al contado bancarizado. */
  @Column({ name: 'numero_operacion', type: 'varchar', length: 50, nullable: true })
  numeroOperacion!: string | null;

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
