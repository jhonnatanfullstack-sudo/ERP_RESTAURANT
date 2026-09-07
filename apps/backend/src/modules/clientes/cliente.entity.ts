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
import { TipoDocumentoIdentidad } from '../catalogos/tipo-documento-identidad.entity';

@Entity('clientes')
@Index(['tipoDocumentoIdentidad', 'numeroDocumento'], { unique: true })
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150 })
  nombres!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  apellidos!: string | null;

  @ManyToOne(() => TipoDocumentoIdentidad, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_documento_identidad_id' })
  tipoDocumentoIdentidad!: TipoDocumentoIdentidad | null;

  @Column({ name: 'numero_documento', type: 'varchar', length: 20, nullable: true })
  numeroDocumento!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 150, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
