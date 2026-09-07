import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catálogo SUNAT N° 01 - Tipo de Comprobante de Pago.
 */
@Entity('tipos_comprobante')
export class TipoComprobante {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 2, unique: true })
  codigo!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
