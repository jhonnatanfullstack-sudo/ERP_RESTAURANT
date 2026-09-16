import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { DetalleRepartoPropina } from './detalle-reparto-propina.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

export enum MetodoRepartoPropina {
  /** Un mismo monto para cada participante, sin importar cuánto trabajó cada uno. */
  IGUALITARIO = 'igualitario',
  /** Proporcional a las horas trabajadas (turnos cerrados) dentro del período. */
  POR_HORAS = 'por_horas',
}

/**
 * Reparto de las propinas recaudadas en un período entre el personal que trabajó en él. Es un
 * registro de cierre, no editable una vez creado (misma filosofía que `Caja`: el monto se
 * calcula y congela en ese momento — si una venta se anula después, no debe alterar un reparto
 * ya hecho).
 *
 * Los participantes no salen de "quién atendió cada mesa" (`Pedido`/`Venta` no llevan ese dato
 * hoy, y agregarlo sería tocar esos módulos sin necesidad — Regla 3 de CLAUDE.md); salen de
 * `Turno`: quien tuvo un turno cerrado dentro del período trabajó ese período, y eso ya es
 * suficiente para repartir sin inventar un nuevo concepto de "mesero asignado".
 */
@Entity('repartos_propinas')
export class RepartoPropina {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ name: 'fecha_desde', type: 'timestamptz' })
  fechaDesde!: Date;

  @Column({ name: 'fecha_hasta', type: 'timestamptz' })
  fechaHasta!: Date;

  @Column({ type: 'enum', enum: MetodoRepartoPropina })
  metodo!: MetodoRepartoPropina;

  /** Suma de `ventas.propina` del período, congelada al momento de repartir. */
  @Column({
    name: 'total_propinas',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: numericTransformer,
  })
  totalPropinas!: number;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_registro_id' })
  usuarioRegistro!: Usuario;

  @Column({ type: 'varchar', length: 255, nullable: true })
  observacion!: string | null;

  @OneToMany(() => DetalleRepartoPropina, (detalle) => detalle.repartoPropina)
  detalles!: DetalleRepartoPropina[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;
}
