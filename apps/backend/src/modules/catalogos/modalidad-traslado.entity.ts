import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catálogo SUNAT N° 18 - Modalidad de Traslado: transporte público (lo hace un tercero con RUC
 * propio) o privado (lo hace la propia empresa con su vehículo). Determina qué datos de
 * transportista exige `GuiaRemision` — ver `guia-remision.dto.ts`.
 */
@Entity('modalidades_traslado')
export class ModalidadTraslado {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 2, unique: true })
  codigo!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
