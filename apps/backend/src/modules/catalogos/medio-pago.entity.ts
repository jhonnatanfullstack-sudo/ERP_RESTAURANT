import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Catálogo propio de medios de pago (efectivo, tarjeta, billeteras digitales, etc.).
 * A diferencia de tipos_comprobante/tipos_documento_identidad/unidades_medida, SUNAT no
 * define un catálogo numerado para el instrumento de pago en boletas/facturas comunes
 * (solo existe uno para detracciones, que no aplica aquí) — este es un catálogo del
 * negocio, sembrado igual que los demás para poder extenderlo sin tocar código.
 */
@Entity('medios_pago')
export class MedioPago {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  codigo!: string;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
