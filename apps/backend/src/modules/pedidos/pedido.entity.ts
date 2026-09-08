import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Mesa } from '../mesas/mesa.entity';
import { Cliente } from '../clientes/cliente.entity';
import { DetallePedido } from './detalle-pedido.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

export enum EstadoPedido {
  ABIERTO = 'abierto',
  CERRADO = 'cerrado',
  CANCELADO = 'cancelado',
}

@Entity('pedidos')
export class Pedido {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Mesa, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mesa_id' })
  mesa!: Mesa;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente | null;

  @Column({ type: 'enum', enum: EstadoPedido, default: EstadoPedido.ABIERTO })
  estado!: EstadoPedido;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  total!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notas!: string | null;

  @Column({ name: 'fecha_cierre', type: 'timestamptz', nullable: true })
  fechaCierre!: Date | null;

  @OneToMany(() => DetallePedido, (detalle) => detalle.pedido)
  detalles!: DetallePedido[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
