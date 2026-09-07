import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Cliente } from '../clientes/cliente.entity';
import { Mesa } from '../mesas/mesa.entity';

export enum EstadoReserva {
  PENDIENTE = 'pendiente',
  CONFIRMADA = 'confirmada',
  CANCELADA = 'cancelada',
  COMPLETADA = 'completada',
}

@Entity('reservas')
export class Reserva {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Cliente, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente;

  @ManyToOne(() => Mesa, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mesa_id' })
  mesa!: Mesa;

  @Column({ name: 'fecha_hora', type: 'timestamptz' })
  fechaHora!: Date;

  @Column({ name: 'duracion_minutos', type: 'smallint', default: 90 })
  duracionMinutos!: number;

  @Column({ name: 'cantidad_personas', type: 'smallint' })
  cantidadPersonas!: number;

  @Column({ type: 'enum', enum: EstadoReserva, default: EstadoReserva.PENDIENTE })
  estado!: EstadoReserva;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notas!: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
