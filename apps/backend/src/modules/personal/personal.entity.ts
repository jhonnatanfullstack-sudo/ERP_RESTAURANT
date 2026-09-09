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
import { Empresa } from '../empresa/empresa.entity';
import { TipoDocumentoIdentidad } from '../catalogos/tipo-documento-identidad.entity';

@Entity('personal')
@Index(['tipoDocumentoIdentidad', 'numeroDocumento'], { unique: true })
export class Personal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => TipoDocumentoIdentidad, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_documento_identidad_id' })
  tipoDocumentoIdentidad!: TipoDocumentoIdentidad;

  @Column({ name: 'numero_documento', type: 'varchar', length: 20 })
  numeroDocumento!: string;

  /** null cuando es persona jurídica: en ese caso el nombre va en `razonSocial`. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  nombres!: string | null;

  @Column({ name: 'apellido_paterno', type: 'varchar', length: 100, nullable: true })
  apellidoPaterno!: string | null;

  @Column({ name: 'apellido_materno', type: 'varchar', length: 100, nullable: true })
  apellidoMaterno!: string | null;

  /** Solo para RUC de persona jurídica (empieza en "20"); mutuamente excluyente
   * con nombres/apellidos. */
  @Column({ name: 'razon_social', type: 'varchar', length: 255, nullable: true })
  razonSocial!: string | null;

  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
  fechaNacimiento!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion!: string | null;

  @Column({ name: 'fecha_ingreso', type: 'date', nullable: true })
  fechaIngreso!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
