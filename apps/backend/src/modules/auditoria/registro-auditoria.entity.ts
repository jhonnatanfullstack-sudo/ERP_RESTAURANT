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
import { Usuario } from '../usuarios/usuario.entity';

/**
 * Qué clase de operación se registró. Se deriva del método HTTP salvo en los casos que
 * merecen nombre propio por su valor para una auditoría (entrar al sistema, anular un
 * documento), donde "POST" no dice nada útil.
 */
export enum AccionAuditoria {
  CREAR = 'crear',
  ACTUALIZAR = 'actualizar',
  ELIMINAR = 'eliminar',
  /** Anular una venta o una compra: revierte dinero o stock, es lo primero que se revisa. */
  ANULAR = 'anular',
  LOGIN = 'login',
  /** Credenciales incorrectas. Se guarda aunque no haya usuario: varios seguidos son la
   * señal de un intento de entrar por fuerza bruta. */
  LOGIN_FALLIDO = 'login_fallido',
  LOGOUT = 'logout',
}

/**
 * Bitácora de todo lo que modifica datos en el sistema: quién, qué, cuándo y desde dónde.
 *
 * Se captura en la capa HTTP (ver `auditoria.middleware.ts`) y no con suscriptores de TypeORM
 * ni llamadas dentro de cada servicio. El motivo: un suscriptor de entidad registra también
 * los guardados internos (cascadas, recálculos) que nadie pidió, y ensuciaría la bitácora con
 * ruido; y llamar al servicio de auditoría desde cada módulo obligaría a tocar los veinte
 * módulos ya escritos. A cambio, esta bitácora responde "quién hizo qué operación", no "qué
 * campo pasó de X a Y" — si algún día hiciera falta ese nivel de detalle, se agrega encima.
 */
@Entity('registros_auditoria')
// La consulta habitual es "lo último primero", con filtros por usuario o módulo.
@Index(['creadoEn'])
@Index(['modulo', 'creadoEn'])
export class RegistroAuditoria {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  /** `null` en un intento de login fallido: todavía no hay sesión que atribuir. */
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario | null;

  @Column({ type: 'enum', enum: AccionAuditoria })
  accion!: AccionAuditoria;

  /** Módulo afectado, derivado del primer segmento de la ruta (`ventas`, `compras`...). */
  @Column({ type: 'varchar', length: 50 })
  modulo!: string;

  /** Id del registro afectado cuando la ruta lo lleva (`/api/ventas/:id/anular`). */
  @Column({ name: 'recurso_id', type: 'varchar', length: 100, nullable: true })
  recursoId!: string | null;

  @Column({ type: 'varchar', length: 10 })
  metodo!: string;

  @Column({ type: 'varchar', length: 255 })
  ruta!: string;

  /** Código HTTP de la respuesta: distingue una operación efectiva de un intento rechazado
   * por permisos (403) o por validación (400), que también interesa auditar. */
  @Column({ name: 'estado_http', type: 'int' })
  estadoHttp!: number;

  @Column({ type: 'varchar', length: 60, nullable: true })
  ip!: string | null;

  /** Cuerpo de la petición con los campos sensibles ya redactados (ver el middleware).
   * Nunca debe contener contraseñas ni tokens. */
  @Column({ type: 'jsonb', nullable: true })
  datos!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
