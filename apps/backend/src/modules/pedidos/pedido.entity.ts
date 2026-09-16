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
import { Mesa } from '../mesas/mesa.entity';
import { Cliente } from '../clientes/cliente.entity';
import { DetallePedido } from './detalle-pedido.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

export enum EstadoPedido {
  ABIERTO = 'abierto',
  CERRADO = 'cerrado',
  CANCELADO = 'cancelado',
}

/** Por dónde entró el pedido. `SALON` es el caso de siempre (lo abre un mesero desde la
 * pantalla de Pedidos); los otros tres los crea el propio cliente sin autenticarse, desde la
 * carta pública (`carta-publica.controller.ts`) — quedan igual de "abiertos" que uno de salón,
 * a la espera de que el staff los revise y los envíe a cocina (ver `comanda.service.ts`), que
 * sigue siendo un paso manual y autenticado: ningún autopedido llega solo a cocina. */
export enum CanalOrigenPedido {
  SALON = 'salon',
  AUTOPEDIDO = 'autopedido',
  DELIVERY = 'delivery',
  RECOJO = 'recojo',
}

/** Lo que el cliente dice que va a usar para pagar, no un cobro real (eso sigue pasando por
 * Caja). Ver migración `MedioPagoPreferidoPedido`. */
export enum MedioPagoPreferido {
  EFECTIVO = 'efectivo',
  YAPE = 'yape',
  PLIN = 'plin',
  TARJETA = 'tarjeta',
}

@Entity('pedidos')
export class Pedido {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  /** null cuando el pedido es "para llevar" (sin mesa asignada) — ver pedido.service.ts. */
  @ManyToOne(() => Mesa, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'mesa_id' })
  mesa!: Mesa | null;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente | null;

  @Column({ type: 'enum', enum: EstadoPedido, default: EstadoPedido.ABIERTO })
  estado!: EstadoPedido;

  @Column({
    name: 'canal_origen',
    type: 'enum',
    enum: CanalOrigenPedido,
    default: CanalOrigenPedido.SALON,
  })
  canalOrigen!: CanalOrigenPedido;

  /** Solo se llenan en un pedido público (`AUTOPEDIDO`/`DELIVERY`/`RECOJO`): quien lo abre
   * desde el salón no necesita decir su nombre, está ahí. */
  @Column({ name: 'contacto_nombre', type: 'varchar', length: 100, nullable: true })
  contactoNombre!: string | null;

  @Column({ name: 'contacto_telefono', type: 'varchar', length: 20, nullable: true })
  contactoTelefono!: string | null;

  /** Solo aplica a `DELIVERY`. */
  @Column({ name: 'direccion_entrega', type: 'varchar', length: 255, nullable: true })
  direccionEntrega!: string | null;

  /** Solo se llena en un pedido público — ver `MedioPagoPreferido`. */
  @Column({
    name: 'medio_pago_preferido',
    type: 'enum',
    enum: MedioPagoPreferido,
    nullable: true,
  })
  medioPagoPreferido!: MedioPagoPreferido | null;

  /** Con cuánto dice el cliente que va a pagar en efectivo, para que el staff prepare el
   * vuelto. Solo tiene sentido junto a `medioPagoPreferido: EFECTIVO`. */
  @Column({
    name: 'vuelto_para',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  vueltoPara!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  total!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notas!: string | null;

  @Column({ name: 'fecha_cierre', type: 'timestamptz', nullable: true })
  fechaCierre!: Date | null;

  @OneToMany(() => DetallePedido, (detalle) => detalle.pedido)
  detalles!: DetallePedido[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
