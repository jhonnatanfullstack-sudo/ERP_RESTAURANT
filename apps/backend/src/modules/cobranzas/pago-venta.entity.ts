import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Venta } from '../ventas/venta.entity';
import { MedioPago } from '../catalogos/medio-pago.entity';
import { Banco } from '../catalogos/banco.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/**
 * Cobro registrado contra una venta al crédito. Varios pagos parciales pueden ir amortizando
 * la misma venta hasta cancelarla; el saldo nunca se guarda en la venta, se calcula sumando
 * los pagos vigentes (ver `cobranza.service.ts: aVistaCobranza`), que es la única forma de
 * que no se desincronice.
 *
 * `banco` y `numeroOperacion` son obligatorios cuando el medio de pago es bancarizado
 * (`MedioPago.requiereBanco`: transferencia, depósito, cheque) — es lo que permite sustentar
 * el cobro ante SUNAT, y lo que hace que en la pantalla se vea "por qué banco entró".
 *
 * Un pago no se borra: se anula (`anulado`), conservando la fila y el motivo, igual que las
 * ventas y las compras del resto del sistema.
 */
@Entity('pagos_venta')
export class PagoVenta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => Venta, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta;

  @Column({ name: 'fecha_pago', type: 'date' })
  fechaPago!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  monto!: number;

  @ManyToOne(() => MedioPago, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'medio_pago_id' })
  medioPago!: MedioPago;

  /** Entidad financiera por la que entró el dinero; null cuando el cobro fue en efectivo. */
  @ManyToOne(() => Banco, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'banco_id' })
  banco!: Banco | null;

  /** Número de operación/voucher que devuelve el banco. */
  @Column({ name: 'numero_operacion', type: 'varchar', length: 50, nullable: true })
  numeroOperacion!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  observacion!: string | null;

  @Column({ type: 'boolean', default: false })
  anulado!: boolean;

  @Column({ name: 'motivo_anulacion', type: 'varchar', length: 255, nullable: true })
  motivoAnulacion!: string | null;

  /** Quién registró el cobro. */
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
