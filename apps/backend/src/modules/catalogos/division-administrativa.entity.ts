import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Pais } from './pais.entity';

/**
 * Departamento/provincia/distrito de Perú, o el nivel equivalente de cualquier otro país,
 * autorreferenciada por `padre` (FASE 27).
 *
 * Genérica a propósito: el esquema no cambia al sumar un país nuevo, solo se agregan filas.
 * Hoy solo está sembrada con la jerarquía completa de Perú (UBIGEO de INEI/RENIEC); otros
 * países quedan con la tabla lista pero sin datos, hasta que haya un cliente real ahí.
 */
@Entity('divisiones_administrativas')
@Index(['pais', 'padre', 'nombre'], { unique: true })
export class DivisionAdministrativa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Pais, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pais_id' })
  pais!: Pais;

  @ManyToOne(() => DivisionAdministrativa, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'padre_id' })
  padre!: DivisionAdministrativa | null;

  /** 1 = departamento/estado, 2 = provincia, 3 = distrito (o el nivel equivalente del país). */
  @Column({ type: 'smallint' })
  nivel!: number;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  /** Código propio del país para esta división, ej. el segmento de UBIGEO en Perú
   * (`020101` = distrito). Nullable: no todos los países tienen un código estándar
   * publicado para sus divisiones administrativas. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  codigo!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
