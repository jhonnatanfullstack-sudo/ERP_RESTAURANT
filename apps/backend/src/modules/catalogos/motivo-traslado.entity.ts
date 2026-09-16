import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catálogo SUNAT N° 20 - Motivo de Traslado. Subconjunto relevante para un restaurante: venta,
 * compra, traslado entre establecimientos propios (llevar insumos del almacén central a un
 * local) y otros — no se cargan los códigos de comercio exterior/consignación que no aplican.
 */
@Entity('motivos_traslado')
export class MotivoTraslado {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 2, unique: true })
  codigo!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
