import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catálogo SUNAT N° 17 - Tipo de Operación.
 */
@Entity('tipos_operacion')
export class TipoOperacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 4, unique: true })
  codigo!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
