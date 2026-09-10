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

/**
 * Quien nos vende mercadería/insumos — a diferencia de `Cliente`, el documento es siempre
 * obligatorio (mismo criterio que `Personal`): para registrar una `Compra` con crédito
 * fiscal hace falta poder identificar formalmente a quién se le compró.
 */
@Entity('proveedores')
@Index(['tipoDocumentoIdentidad', 'numeroDocumento'], { unique: true })
export class Proveedor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  nombres!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  apellidos!: string | null;

  /** Solo para proveedores con RUC de persona jurídica (empieza en "20") — la inmensa
   * mayoría, ya que un proveedor formal casi siempre es una empresa. Mutuamente excluyente
   * con nombres/apellidos, igual criterio que `Cliente`/`Personal`. */
  @Column({ name: 'razon_social', type: 'varchar', length: 255, nullable: true })
  razonSocial!: string | null;

  @ManyToOne(() => TipoDocumentoIdentidad, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_documento_identidad_id' })
  tipoDocumentoIdentidad!: TipoDocumentoIdentidad;

  @Column({ name: 'numero_documento', type: 'varchar', length: 20 })
  numeroDocumento!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono!: string | null;

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
