import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Pedido } from './pedido.entity';
import { Producto } from '../productos/producto.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

@Entity('detalle_pedidos')
export class DetallePedido {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Pedido, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pedido_id' })
  pedido!: Pedido;

  @ManyToOne(() => Producto, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

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

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  subtotal!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notas!: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
