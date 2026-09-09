import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UnidadMedida } from '../catalogos/unidad-medida.entity';

/**
 * Materia prima que se consume al preparar un platillo (harina, pollo, aceite…) — nunca se
 * vende directamente al cliente, por eso no es un `Producto` (que sí aparece en la Carta):
 * un insumo solo existe para que una `RecetaInsumo` lo descuente cuando se prepara/vende el
 * producto tipo `servicio` que lo usa. Su stock vive en `existencias`, igual que el de un
 * producto tipo `mercaderia`.
 */
@Entity('insumos')
export class Insumo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  nombre!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descripcion!: string | null;

  @ManyToOne(() => UnidadMedida, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_medida_id' })
  unidadMedida!: UnidadMedida;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
