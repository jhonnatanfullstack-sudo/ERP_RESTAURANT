import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Usuario } from '../usuarios/usuario.entity';
import { RepartoPropina } from './reparto-propina.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/** Monto que le tocó a un usuario en un reparto de propinas — ver `reparto-propina.entity.ts`. */
@Entity('detalle_repartos_propinas')
export class DetalleRepartoPropina {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => RepartoPropina, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reparto_propina_id' })
  repartoPropina!: RepartoPropina;

  @ManyToOne(() => Usuario, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  /** Solo tiene sentido con el método `por_horas`; `null` en un reparto `igualitario`. */
  @Column({
    name: 'horas_trabajadas',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  horasTrabajadas!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  monto!: number;
}
