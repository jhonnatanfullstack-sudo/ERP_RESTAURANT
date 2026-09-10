import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Compra } from './compra.entity';
import { Insumo } from '../insumos/insumo.entity';
import { Producto } from '../productos/producto.entity';
import { TipoAfectacionIgv } from '../catalogos/tipo-afectacion-igv.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/**
 * Una línea de compra: exactamente un `insumo` o un `producto` (tipo `mercaderia`, mismo
 * criterio que `Existencia` — un `servicio` no se compra, se prepara). `costoUnitario` es el
 * precio pagado por unidad, con IGV incluido (igual convención que `Producto.precio`);
 * `valorCompra`/`igv` se desglosan con la afectación propia del ítem comprado (no la de
 * `Empresa`: la tasa reducida MYPE es sobre las ventas del restaurante, no sobre lo que le
 * cobra un proveedor — ver `compra.service.ts`).
 */
@Entity('detalle_compras')
@Check('CHK_detalle_compra_item_exclusivo', '(insumo_id IS NULL) != (producto_id IS NULL)')
export class DetalleCompra {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Compra, (compra) => compra.detalles, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'compra_id' })
  compra!: Compra;

  @ManyToOne(() => Insumo, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'insumo_id' })
  insumo!: Insumo | null;

  @ManyToOne(() => Producto, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto | null;

  @Column({ name: 'descripcion_item', type: 'varchar', length: 150 })
  descripcionItem!: string;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: numericTransformer })
  cantidad!: number;

  @Column({
    name: 'costo_unitario',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  costoUnitario!: number;

  @ManyToOne(() => TipoAfectacionIgv, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_afectacion_igv_id' })
  tipoAfectacionIgv!: TipoAfectacionIgv;

  @Column({
    name: 'valor_compra',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  valorCompra!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  igv!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  subtotal!: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
