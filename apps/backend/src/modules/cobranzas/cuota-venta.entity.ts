import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Venta } from '../ventas/venta.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/**
 * Cuota del cronograma de una venta al crédito.
 *
 * No es un adorno: la Resolución 193-2020/SUNAT obliga a que una factura o boleta emitida al
 * crédito consigne el monto neto pendiente de pago y **el detalle de cada cuota** (número,
 * importe y fecha de vencimiento). Una venta al contado no tiene cuotas.
 *
 * El cronograma es lo pactado; lo efectivamente cobrado vive en `PagoVenta`, que se aplica
 * contra el saldo de la venta y no contra una cuota puntual (un cliente puede abonar un monto
 * que cubre media cuota o dos cuotas y media).
 */
@Entity('cuotas_venta')
@Index('IDX_una_cuota_por_numero_en_venta', ['venta', 'numero'], { unique: true })
export class CuotaVenta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => Venta, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta;

  /** Correlativo dentro de la venta, empezando en 1 (SUNAT lo nombra "Cuota001"). */
  @Column({ type: 'int' })
  numero!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  monto!: number;

  @Column({ name: 'fecha_vencimiento', type: 'date' })
  fechaVencimiento!: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
