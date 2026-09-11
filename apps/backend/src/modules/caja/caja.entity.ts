import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { MovimientoCaja } from './movimiento-caja.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

export enum EstadoCaja {
  ABIERTA = 'abierta',
  CERRADA = 'cerrada',
}

@Entity('cajas')
// Índice único parcial: solo puede haber una fila con estado 'abierta' a la vez. Es la misma
// invariante que "una sola sesión de caja activa" pero garantizada por Postgres, no solo por
// el chequeo en caja.service.ts — evita una condición de carrera si dos "abrir caja" llegan
// al mismo tiempo.
// Una sola caja abierta **por empresa**, no en todo el sistema: con multi-empresa, el índice
// global impedía que un restaurante abriera caja si otro la tenía abierta.
@Index('IDX_una_caja_abierta_por_empresa', ['empresa', 'estado'], {
  unique: true,
  where: `"estado" = 'abierta'`,
})
export class Caja {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_apertura_id' })
  usuarioApertura!: Usuario;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_cierre_id' })
  usuarioCierre!: Usuario | null;

  @Column({
    name: 'monto_apertura',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  montoApertura!: number;

  @Column({ name: 'observacion_apertura', type: 'varchar', length: 255, nullable: true })
  observacionApertura!: string | null;

  /** Efectivo esperado al cerrar: apertura + ventas en efectivo del turno + ingresos manuales
   * - egresos manuales (ver caja.service.ts: cerrarCaja). Se calcula y congela en ese momento
   * — si una venta se anula después, no debe alterar un arqueo ya hecho. */
  @Column({
    name: 'monto_esperado',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  montoEsperado!: number | null;

  /** Lo que el cajero contó físicamente al cerrar. */
  @Column({
    name: 'monto_declarado',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  montoDeclarado!: number | null;

  /** montoDeclarado - montoEsperado: positivo es sobrante, negativo es faltante. */
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  diferencia!: number | null;

  @Column({ name: 'observacion_cierre', type: 'varchar', length: 255, nullable: true })
  observacionCierre!: string | null;

  @Column({ type: 'enum', enum: EstadoCaja, default: EstadoCaja.ABIERTA })
  estado!: EstadoCaja;

  @OneToMany(() => MovimientoCaja, (movimiento) => movimiento.caja)
  movimientos!: MovimientoCaja[];

  /** Fecha de apertura de la sesión (el registro se crea exactamente al abrir la caja). */
  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @Column({ name: 'fecha_cierre', type: 'timestamptz', nullable: true })
  fechaCierre!: Date | null;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
