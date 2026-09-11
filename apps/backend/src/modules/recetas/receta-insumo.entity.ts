import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Producto } from '../productos/producto.entity';
import { Insumo } from '../insumos/insumo.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/**
 * Una línea de la receta de un producto tipo `servicio`: cuánto de un insumo consume UNA
 * unidad de ese platillo (en la unidad de medida del propio insumo). `modules/inventario`
 * multiplica `cantidad` por las unidades vendidas/preparadas para descontar el stock del
 * insumo — un producto tipo `mercaderia` no tiene filas aquí, descuenta su propio stock.
 */
@Entity('receta_insumos')
@Index(['producto', 'insumo'], { unique: true })
export class RecetaInsumo {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => Producto, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @ManyToOne(() => Insumo, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'insumo_id' })
  insumo!: Insumo;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: numericTransformer })
  cantidad!: number;
}
