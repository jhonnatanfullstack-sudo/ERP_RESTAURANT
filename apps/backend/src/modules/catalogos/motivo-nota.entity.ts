import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catálogos SUNAT N° 09 (motivo de Nota de Crédito) y N° 10 (motivo de Nota de Débito), en una
 * sola tabla porque comparten forma exacta (código + nombre) y solo se distinguen por a qué
 * tipo de nota aplican — separarlos en dos tablas sería duplicar la entidad para no ganar nada
 * (Regla 7 de CLAUDE.md).
 */
@Entity('motivos_nota')
@Index(['tipoDocumento', 'codigo'], { unique: true })
export class MotivoNota {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** '07' = Nota de Crédito, '08' = Nota de Débito (mismos códigos del catálogo N° 01 de
   * tipo de comprobante) — determina si este motivo aparece al crear una u otra. */
  @Column({ name: 'tipo_documento', type: 'varchar', length: 2 })
  tipoDocumento!: string;

  @Column({ type: 'varchar', length: 2 })
  codigo!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
