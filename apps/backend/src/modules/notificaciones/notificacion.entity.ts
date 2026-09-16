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

export enum TipoNotificacion {
  COMANDA_LISTA = 'comanda_lista',
  PEDIDO_NUEVO = 'pedido_nuevo',
  RECLAMO_NUEVO = 'reclamo_nuevo',
}

/**
 * Notificación del equipo — una bandeja compartida por empresa, no una por cada usuario: quien
 * la marca leída la marca leída para todos. Para un equipo pequeño (la mayoría de restaurantes
 * que usan este sistema) evita la complejidad de una tabla de lecturas por persona sin perder
 * lo esencial, que es que el equipo se entere de lo que pasó. Se genera desde el propio backend
 * (comanda lista, pedido nuevo desde la carta pública, reclamo nuevo) — nunca directamente por
 * la API, por eso no tiene un endpoint de creación.
 */
@Entity('notificaciones')
@Index('IDX_notificaciones_empresa_creado', ['empresa', 'creadoEn'])
export class Notificacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'enum', enum: TipoNotificacion })
  tipo!: TipoNotificacion;

  @Column({ type: 'varchar', length: 150 })
  titulo!: string;

  @Column({ type: 'varchar', length: 300 })
  mensaje!: string;

  /** Para armar el enlace del lado del cliente (ej. `pedido` + `entidadId` → `/pedidos/:id`).
   * `null` cuando la notificación no apunta a nada navegable. */
  @Column({ name: 'entidad_tipo', type: 'varchar', length: 30, nullable: true })
  entidadTipo!: string | null;

  @Column({ name: 'entidad_id', type: 'uuid', nullable: true })
  entidadId!: string | null;

  @Column({ type: 'boolean', default: false })
  leida!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
