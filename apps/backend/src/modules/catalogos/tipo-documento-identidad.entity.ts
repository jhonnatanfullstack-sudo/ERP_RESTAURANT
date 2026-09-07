import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catálogo SUNAT N° 06 - Tipo de Documento de Identidad.
 */
@Entity('tipos_documento_identidad')
export class TipoDocumentoIdentidad {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 2, unique: true })
  codigo!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
