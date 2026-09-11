import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Entidades del sistema financiero peruano, con el código que les asigna la SBS (el mismo que
 * usa SUNAT en su Catálogo N° 54 para detracciones). Se necesita para dejar constancia de
 * **por dónde entró el dinero** cuando el pago no fue en efectivo: la Ley 28194 (bancarización)
 * obliga a usar medios de pago del sistema financiero desde S/ 2,000 o US$ 500, y en una
 * fiscalización hay que poder mostrar banco y número de operación de cada cobro.
 */
@Entity('bancos')
export class Banco {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Código SBS de la entidad financiera (ej. "002" BCP, "011" BBVA). */
  @Column({ type: 'varchar', length: 4, unique: true })
  codigo!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
