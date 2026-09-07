import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Rol } from '../roles/rol.entity';
import { Personal } from '../personal/personal.entity';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Personal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'personal_id' })
  personal!: Personal;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 150, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @ManyToOne(() => Rol, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'rol_id' })
  rol!: Rol;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
