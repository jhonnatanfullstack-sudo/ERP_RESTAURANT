import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Salon } from '../salones/salon.entity';

@Entity('mesas')
@Index(['salon', 'numero'], { unique: true })
export class Mesa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Salon, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'salon_id' })
  salon!: Salon;

  @Column({ type: 'varchar', length: 20 })
  numero!: string;

  @Column({ type: 'smallint' })
  capacidad!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
