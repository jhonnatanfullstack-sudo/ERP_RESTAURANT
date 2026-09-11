import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Categoria } from '../categorias/categoria.entity';
import { Marca } from '../marcas/marca.entity';
import { UnidadMedida } from '../catalogos/unidad-medida.entity';
import { TipoAfectacionIgv } from '../catalogos/tipo-afectacion-igv.entity';

/** Distinción contable/SUNAT entre bienes y servicios (misma idea que ya separan
 * `tipos_afectacion_igv`/`tipos_operacion`), y la que decide si un producto tiene stock
 * propio en `existencias` o si se prepara consumiendo insumos vía `RecetaInsumo`:
 * - MERCADERIA: se vende tal cual (ej. una gaseosa embotellada) — tiene stock propio,
 *   descontado directamente al venderse.
 * - SERVICIO: se prepara (ej. un platillo) — no tiene stock propio; su venta descuenta el
 *   stock de sus insumos según la receta (`modules/recetas`), no el suyo.
 */
export enum TipoProducto {
  MERCADERIA = 'mercaderia',
  SERVICIO = 'servicio',
}

@Entity('productos')
export class Producto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => Categoria, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoria_id' })
  categoria!: Categoria;

  @ManyToOne(() => Marca, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'marca_id' })
  marca!: Marca | null;

  @ManyToOne(() => UnidadMedida, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_medida_id' })
  unidadMedida!: UnidadMedida;

  @ManyToOne(() => TipoAfectacionIgv, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_afectacion_igv_id' })
  tipoAfectacionIgv!: TipoAfectacionIgv;

  @Column({ type: 'enum', enum: TipoProducto, default: TipoProducto.SERVICIO })
  tipo!: TipoProducto;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descripcion!: string | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: { to: (valor: number) => valor, from: (valor: string) => Number(valor) },
  })
  precio!: number;

  @Column({ name: 'imagen_url', type: 'varchar', length: 500, nullable: true })
  imagenUrl!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
