import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Caja } from './caja.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

export enum TipoMovimientoCaja {
  INGRESO = 'ingreso',
  EGRESO = 'egreso',
}

/** Ingreso o egreso manual dentro de una sesión de caja abierta (ej. un vuelto de más, un
 * pago a un proveedor menor, un retiro parcial) — no incluye las ventas en efectivo, que se
 * calculan aparte al cerrar (ver caja.service.ts: calcularVentasEfectivo). Es un registro
 * inmutable, como DetalleVenta: no tiene actualizadoEn. */
@Entity('movimientos_caja')
export class MovimientoCaja {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Caja, (caja) => caja.movimientos, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'caja_id' })
  caja!: Caja;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column({ type: 'enum', enum: TipoMovimientoCaja })
  tipo!: TipoMovimientoCaja;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  monto!: number;

  @Column({ type: 'varchar', length: 255 })
  concepto!: string;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
