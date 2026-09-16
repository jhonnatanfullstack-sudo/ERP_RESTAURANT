import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Cliente } from '../clientes/cliente.entity';
import { Venta } from '../ventas/venta.entity';
import { Usuario } from '../usuarios/usuario.entity';

export enum TipoMovimientoFidelizacion {
  /** Automático, al emitir una venta con cliente identificado. */
  GANADO = 'ganado',
  /** Un miembro del staff aplica puntos como descuento de una venta. */
  CANJEADO = 'canjeado',
  /** Corrección manual (positiva o negativa) — ej. puntos de cortesía, o revertir un error. */
  AJUSTE = 'ajuste',
}

/**
 * Un movimiento del kardex de puntos de un cliente — mismo criterio que `existencias`: el
 * saldo nunca se guarda como un número aparte que haya que mantener sincronizado, es la suma
 * de sus movimientos (ver `fidelizacion.service.ts: obtenerSaldo`). `puntos` ya viene con el
 * signo correcto (negativo en `canjeado`, positivo en `ganado`; cualquiera de los dos en
 * `ajuste`), así que el saldo es una simple suma, sin `CASE` por tipo.
 */
@Entity('movimientos_fidelizacion')
@Index('IDX_movimientos_fidelizacion_cliente', ['empresa', 'cliente'])
export class MovimientoFidelizacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => Cliente, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente;

  @Column({ type: 'enum', enum: TipoMovimientoFidelizacion })
  tipo!: TipoMovimientoFidelizacion;

  @Column({ type: 'integer' })
  puntos!: number;

  /** Venta que originó el movimiento — la que lo ganó, o la que se pagó en parte con el
   * canje. `null` en un ajuste manual sin venta detrás. */
  @ManyToOne(() => Venta, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta | null;

  /** Quién lo registró — solo en `canjeado`/`ajuste`, que son manuales; `null` en `ganado`,
   * que lo dispara el propio flujo de la venta, no una persona. */
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  observacion!: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
