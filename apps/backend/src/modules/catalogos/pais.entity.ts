import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catálogo de países (ISO 3166-1), sembrado por migración (FASE 27).
 *
 * Preparación para el día en que el sistema tenga empresas fuera de Perú (ver CLAUDE.md
 * sección 1): hoy todo el negocio real es peruano, pero identificar el país de quien se
 * registra no debía depender de rehacer el modelo de datos más adelante.
 */
@Entity('paises')
export class Pais {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'codigo_iso2', type: 'varchar', length: 2, unique: true })
  codigoIso2!: string;

  @Column({ name: 'codigo_iso3', type: 'varchar', length: 3, unique: true })
  codigoIso3!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
