import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { GuiaRemision } from './guia-remision.entity';
import { UnidadMedida } from '../catalogos/unidad-medida.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/** Línea de una `GuiaRemision`: qué se traslada, sin precio ni IGV — un traslado no es una
 * venta, aunque la acompañe (ver `GuiaRemision.venta`). */
@Entity('detalle_guias_remision')
export class DetalleGuiaRemision {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => GuiaRemision, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guia_remision_id' })
  guiaRemision!: GuiaRemision;

  @Column({ type: 'varchar', length: 150 })
  descripcion!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  cantidad!: number;

  @ManyToOne(() => UnidadMedida, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_medida_id' })
  unidadMedida!: UnidadMedida;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
