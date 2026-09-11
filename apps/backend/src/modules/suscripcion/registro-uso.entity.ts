import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';

/**
 * Uso diario del sistema por empresa: una fila por empresa y día, con contadores que se van
 * acumulando a medida que llegan peticiones.
 *
 * **Por qué agregado por día y no una fila por petición.** Lo que el proveedor necesita
 * responder es "¿esta demo se está usando de verdad, o la abrieron una vez y la dejaron?".
 * Para eso basta con cuántas peticiones y cuántas escrituras hubo cada día y cuándo fue el
 * último acceso. Una bitácora petición por petición respondería lo mismo ocupando miles de
 * veces más espacio — y la traza fina de quién hizo qué ya la lleva `registros_auditoria`,
 * que existe desde FASE 20 y tiene otro propósito.
 */
@Entity('registros_uso')
@Index(['empresa', 'fecha'], { unique: true })
export class RegistroUso {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  /** Día al que corresponden los contadores (`YYYY-MM-DD`). */
  @Column({ type: 'date' })
  fecha!: string;

  /** Peticiones autenticadas a la API. Excluye `/health` y las rutas públicas de la carta:
   * un cliente mirando el menú no es uso del sistema por parte del restaurante. */
  @Column({ type: 'integer', default: 0 })
  peticiones!: number;

  /** Subconjunto de `peticiones` que modificó datos (POST/PUT/PATCH/DELETE). Es el número
   * que de verdad distingue a quien está operando el restaurante de quien solo mira. */
  @Column({ type: 'integer', default: 0 })
  escrituras!: number;

  @Column({ name: 'ultimo_acceso', type: 'timestamptz' })
  ultimoAcceso!: Date;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
