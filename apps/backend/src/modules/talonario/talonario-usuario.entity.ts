import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Talonario } from './talonario.entity';
import { Usuario } from '../usuarios/usuario.entity';

/**
 * Qué usuarios pueden emitir desde un talonario. Al registrar una venta solo se ofrecen (y
 * solo se aceptan) los talonarios asignados al usuario autenticado — así dos cajeros con
 * series distintas nunca se pisan el correlativo.
 */
@Entity('talonario_usuarios')
@Index('IDX_un_talonario_por_usuario', ['talonario', 'usuario'], { unique: true })
export class TalonarioUsuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => Talonario, (talonario) => talonario.usuarios, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'talonario_id' })
  talonario!: Talonario;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
