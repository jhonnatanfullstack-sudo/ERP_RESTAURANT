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
import { Usuario } from '../usuarios/usuario.entity';

export enum EstadoTurno {
  ABIERTO = 'abierto',
  CERRADO = 'cerrado',
}

@Entity('turnos')
// A diferencia de Caja (una sola sesión abierta por empresa), acá puede haber varios turnos
// abiertos a la vez: un mesero y un cocinero trabajando en simultáneo son dos turnos, no uno.
// Lo que no puede pasar es que la misma persona tenga dos turnos abiertos al mismo tiempo —
// por ejemplo si se le olvidó cerrar el de ayer.
@Index('IDX_un_turno_abierto_por_usuario', ['empresa', 'usuario', 'estado'], {
  unique: true,
  where: `"estado" = 'abierto'`,
})
export class Turno {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  /** Quién trabajó el turno. */
  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  /** Quién lo cerró — normalmente la misma persona, pero un supervisor con `turnos.cerrar`
   * puede cerrar el turno de alguien que se olvidó de hacerlo. */
  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_cierre_id' })
  usuarioCierre!: Usuario | null;

  @Column({ name: 'nota_apertura', type: 'varchar', length: 255, nullable: true })
  notaApertura!: string | null;

  @Column({ name: 'nota_cierre', type: 'varchar', length: 255, nullable: true })
  notaCierre!: string | null;

  @Column({ type: 'enum', enum: EstadoTurno, default: EstadoTurno.ABIERTO })
  estado!: EstadoTurno;

  /** Momento de inicio del turno (el registro se crea exactamente al abrirlo). */
  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @Column({ name: 'fecha_cierre', type: 'timestamptz', nullable: true })
  fechaCierre!: Date | null;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
