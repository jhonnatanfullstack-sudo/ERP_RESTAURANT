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
import { UnidadMedida } from '../catalogos/unidad-medida.entity';
import { TipoAfectacionIgv } from '../catalogos/tipo-afectacion-igv.entity';

/**
 * Materia prima que se consume al preparar un platillo (harina, pollo, aceite…) — nunca se
 * vende directamente al cliente, por eso no es un `Producto` (que sí aparece en la Carta):
 * un insumo solo existe para que una `RecetaInsumo` lo descuente cuando se prepara/vende el
 * producto tipo `servicio` que lo usa. Su stock vive en `existencias`, igual que el de un
 * producto tipo `mercaderia`.
 *
 * Tiene su propio `tipoAfectacionIgv`, independiente del que tenga el platillo que lo usa:
 * SUNAT exonera del IGV la venta de productos agropecuarios frescos en su estado natural
 * (Apéndice I de la Ley del IGV) — una verdura o una fruta que se compra fresca suele venir
 * exonerada, aunque el platillo preparado con ella sí esté gravado. El IGV de una compra de
 * insumo se calcula con este campo, no con el del producto final.
 */
@Entity('insumos')
@Index(['empresa', 'nombre'], { unique: true })
export class Insumo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descripcion!: string | null;

  @ManyToOne(() => UnidadMedida, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_medida_id' })
  unidadMedida!: UnidadMedida;

  @ManyToOne(() => TipoAfectacionIgv, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_afectacion_igv_id' })
  tipoAfectacionIgv!: TipoAfectacionIgv;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
