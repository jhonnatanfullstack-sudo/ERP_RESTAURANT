import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Almacen } from '../almacenes/almacen.entity';
import { Insumo } from '../insumos/insumo.entity';
import { Producto } from '../productos/producto.entity';
import { Comanda } from '../cocina/comanda.entity';
import { Venta } from '../ventas/venta.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/**
 * Kardex: un movimiento de stock por fila (no columnas anchas de "stock compra"/"stock
 * venta" en la misma fila) — el saldo de un ítem en un almacén es la suma con signo de sus
 * movimientos (ver `existencia.service.ts: calcularStock`). Solo aplica a mercadería real:
 * un `Insumo`, o un `Producto` tipo `mercaderia`. Un `Producto` tipo `servicio` (un platillo)
 * nunca tiene filas propias aquí — su venta descuenta el stock de sus insumos vía
 * `RecetaInsumo`, no un stock propio que no existe.
 */
export enum TipoMovimientoExistencia {
  /** Saldo inicial al registrar el ítem con stock existente en un almacén. */
  INICIAL = 'inicial',
  /** Entrada por compra (a proveedor o registrada a mano, mientras no exista FASE 17). */
  COMPRA = 'compra',
  /** Corrección manual positiva (ej. conteo físico encontró más de lo esperado). */
  AJUSTE_ENTRADA = 'ajuste_entrada',
  /** Corrección manual negativa (ej. merma, producto vencido). */
  AJUSTE_SALIDA = 'ajuste_salida',
  /** Salida real al preparar un platillo: se registra cuando cocina marca la comanda como
   * "entregado" (`comanda_id` queda seteado). Es el momento en que el insumo físicamente se
   * usó, antes de que exista ningún comprobante — por eso puede no tener `venta_id` todavía. */
  CONSUMO_COCINA = 'consumo_cocina',
  /** Salida registrada en el momento de emitir la venta porque no hubo un paso de cocina que
   * la anticipara — cubre tanto una venta directa (sin pedido) como una línea de un pedido
   * que nunca se envió a cocina (un pedido no puede cerrarse con una comanda todavía activa,
   * así que si `detalle.comanda` es `null` al facturar, es porque esa línea nunca pasó por
   * cocina, no porque siga pendiente). */
  VENTA_DIRECTA = 'venta_directa',
}

const TIPOS_ENTRADA = [
  TipoMovimientoExistencia.INICIAL,
  TipoMovimientoExistencia.COMPRA,
  TipoMovimientoExistencia.AJUSTE_ENTRADA,
];

export function esMovimientoDeEntrada(tipo: TipoMovimientoExistencia): boolean {
  return TIPOS_ENTRADA.includes(tipo);
}

@Entity('existencias')
@Check('CHK_existencia_item_exclusivo', '(insumo_id IS NULL) != (producto_id IS NULL)')
export class Existencia {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Almacen, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'almacen_id' })
  almacen!: Almacen;

  @ManyToOne(() => Insumo, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'insumo_id' })
  insumo!: Insumo | null;

  @ManyToOne(() => Producto, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto | null;

  @Column({ type: 'enum', enum: TipoMovimientoExistencia })
  tipo!: TipoMovimientoExistencia;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: numericTransformer })
  cantidad!: number;

  /** Costo unitario de compra — solo `inicial`/`compra`/`ajuste_entrada`. */
  @Column({
    name: 'costo_unitario',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  costoUnitario!: number | null;

  /** Comanda que originó un `consumo_cocina` — trazabilidad de a qué preparación
   * correspondió el descuento, no participa en el cálculo de stock. */
  @ManyToOne(() => Comanda, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'comanda_id' })
  comanda!: Comanda | null;

  /** Venta que finalmente facturó este movimiento. Se completa de inmediato en
   * `venta_directa`; en `consumo_cocina` puede quedar `null` hasta que el pedido se
   * facture (o para siempre, si nunca se factura — el consumo físico ya ocurrió igual). */
  @ManyToOne(() => Venta, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta | null;

  /** Quién registró el movimiento — solo para los manuales (`compra`/`ajuste_*`/`inicial`);
   * `null` en los automáticos (`consumo_cocina`/`venta_directa`), que no los dispara una
   * persona sino el flujo del pedido/venta. */
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  observacion!: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
