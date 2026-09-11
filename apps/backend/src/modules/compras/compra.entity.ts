import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Proveedor } from '../proveedores/proveedor.entity';
import { Almacen } from '../almacenes/almacen.entity';
import { TipoComprobante } from '../catalogos/tipo-comprobante.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { DetalleCompra } from './detalle-compra.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

export enum EstadoCompra {
  REGISTRADA = 'registrada',
  ANULADA = 'anulada',
}

/**
 * Registra una compra a un `Proveedor` — a diferencia de `Venta` (donde nosotros emitimos el
 * comprobante), acá el comprobante lo emite el proveedor: `serie`/`numero` son texto libre
 * (no un correlativo propio) porque cada proveedor factura con su propio formato. Al
 * registrarla, cada línea genera un movimiento `compra` en `existencias` (ver
 * `compra.service.ts`) — es la forma real de dar de alta stock, reemplazando el registro
 * manual de `POST /api/existencias/movimientos` que existía desde FASE 16.
 */
@Entity('compras')
export class Compra {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => Proveedor, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor!: Proveedor;

  @ManyToOne(() => Almacen, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'almacen_id' })
  almacen!: Almacen;

  @ManyToOne(() => TipoComprobante, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_comprobante_id' })
  tipoComprobante!: TipoComprobante | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  serie!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  numero!: string | null;

  @Column({ name: 'fecha_emision', type: 'date' })
  fechaEmision!: string;

  /** Si el `costoUnitario` que se tipeó en cada línea ya trae el IGV incluido (lo usual, misma
   * convención que `Producto.precio`) o si es el valor de compra puro y el IGV se agrega aparte
   * — un comprobante de proveedor puede venir de cualquiera de las dos formas. Se guarda a
   * nivel de compra (no por línea) porque un mismo comprobante siempre usa un solo criterio.
   * Ver `compra.service.ts: calcularLineaCompra`. */
  @Column({ name: 'incluye_igv', type: 'boolean', default: true })
  incluyeIgv!: boolean;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  subtotal!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  igv!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  total!: number;

  @Column({ type: 'enum', enum: EstadoCompra, default: EstadoCompra.REGISTRADA })
  estado!: EstadoCompra;

  @Column({ type: 'varchar', length: 255, nullable: true })
  observacion!: string | null;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @OneToMany(() => DetalleCompra, (detalle) => detalle.compra)
  detalles!: DetalleCompra[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
