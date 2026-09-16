import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Producto } from '../productos/producto.entity';
import { TipoAfectacionIgv } from '../catalogos/tipo-afectacion-igv.entity';
import { NotaVenta } from './nota-venta.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/**
 * Línea de una `NotaVenta` — mismos campos que `DetalleVenta` (snapshot de nombre, precio y
 * afectación al momento de emitir) salvo `producto`, que aquí es opcional: una Nota de Crédito
 * clona las líneas de la venta original (si tiene producto), pero una Nota de Débito describe
 * un concepto libre (interés moratorio, penalidad…) que no es un plato de la carta.
 */
@Entity('detalle_notas_venta')
export class DetalleNotaVenta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => NotaVenta, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'nota_venta_id' })
  notaVenta!: NotaVenta;

  @ManyToOne(() => Producto, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto | null;

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
