import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venta } from './venta.entity';
import { Producto } from '../productos/producto.entity';
import { TipoAfectacionIgv } from '../catalogos/tipo-afectacion-igv.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/**
 * Línea de una Venta — snapshot de la línea del Pedido de origen al momento de facturar
 * (nombre, precio y tipo de afectación del IGV), para que la venta emitida no cambie
 * si el producto se edita/desactiva después. Mismo criterio que DetallePedido con
 * precioUnitario/subtotal.
 */
@Entity('detalle_ventas')
export class DetalleVenta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Venta, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta;

  @ManyToOne(() => Producto, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({ name: 'descripcion_producto', type: 'varchar', length: 150 })
  descripcionProducto!: string;

  @Column({ type: 'smallint' })
  cantidad!: number;

  @Column({
    name: 'precio_unitario',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  precioUnitario!: number;

  @ManyToOne(() => TipoAfectacionIgv, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_afectacion_igv_id' })
  tipoAfectacionIgv!: TipoAfectacionIgv;

  @Column({
    name: 'valor_venta',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  valorVenta!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  igv!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  subtotal!: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
