import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa, PlanContratado } from '../empresa/empresa.entity';
import { CicloFacturacion } from './planes';

export enum EstadoSolicitudSuscripcion {
  PENDIENTE = 'pendiente',
  CONFIRMADA = 'confirmada',
  RECHAZADA = 'rechazada',
}

/**
 * Pedido de un restaurante de contratar (o renovar) un plan (FASE 29). No hay todavía una
 * pasarela de pago conectada: el pago se coordina fuera del sistema (Yape, transferencia) y el
 * proveedor lo confirma a mano desde `/plataforma`, que es lo que realmente activa la cuenta.
 *
 * Queda preparado para conectar un webhook real después: `referenciaPago` es el hueco donde
 * viajaría el id de la operación del gateway (Culqi/Mercado Pago), y confirmar una solicitud
 * ya es una función propia (`plataforma.service.ts::confirmarSolicitud`) que un webhook podría
 * llamar en vez del botón del panel, sin cambiar nada de este modelo.
 */
@Entity('solicitudes_suscripcion')
export class SolicitudSuscripcion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'enum', enum: PlanContratado })
  plan!: PlanContratado;

  @Column({ type: 'enum', enum: CicloFacturacion })
  ciclo!: CicloFacturacion;

  /** Cuántos meses activa la cuenta al confirmarse — copia de `MESES_POR_CICLO[ciclo]`, para
   * no depender de que esa tabla nunca cambie de significado y romper solicitudes viejas. */
  @Column({ type: 'smallint' })
  meses!: number;

  /** Monto acordado al momento de la solicitud — una "foto" del precio, para que una
   * corrección de tarifas después no cambie lo que esta solicitud ya comprometió. */
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  monto!: number;

  @Column({
    type: 'enum',
    enum: EstadoSolicitudSuscripcion,
    default: EstadoSolicitudSuscripcion.PENDIENTE,
  })
  estado!: EstadoSolicitudSuscripcion;

  /** Nota libre de quien pidió el plan (ej. "ya hice el Yape, operación 123456"), para que el
   * proveedor tenga contexto al revisar la solicitud en el panel. */
  @Column({ name: 'mensaje_contacto', type: 'varchar', length: 500, nullable: true })
  mensajeContacto!: string | null;

  /** Referencia de una pasarela real (id de cargo/orden) — sin usar todavía, ver el
   * comentario de la clase. */
  @Column({ name: 'referencia_pago', type: 'varchar', length: 100, nullable: true })
  referenciaPago!: string | null;

  @Column({ name: 'confirmado_en', type: 'timestamptz', nullable: true })
  confirmadoEn!: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
